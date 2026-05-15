import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';
import { createUserWithRole } from './helpers/auth.helper';
import { UserRole } from '../src/modules/users/entities/user.entity';
import { Item, ItemType } from '../src/modules/items/entities/item.entity';
import { Loan, LoanStatus } from '../src/modules/loans/entities/loan.entity';

describe('Loans (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await destroyApp(app);
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  async function seedItem(code = 'T-001'): Promise<Item> {
    const ds = app.get(DataSource);
    const repo = ds.getRepository(Item);
    return repo.save(
      repo.create({ code, title: 'Libro Test', type: ItemType.BOOK, isActive: true }),
    );
  }

  function futureDueAt(days = 10): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  async function createLoan(librarianToken: string, userId: string, itemId: string) {
    return request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${librarianToken}`)
      .send({ userId, itemId, dueAt: futureDueAt() });
  }

  it('flujo completo: LIBRARIAN crea préstamo para MEMBER → devuelve a tiempo → fineAmount 0', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem();

    const loan = await createLoan(librarian.accessToken, member.user.id, item.id).expect(201);
    expect(loan.body.status).toBe(LoanStatus.ACTIVE);
    expect(loan.body.userId).toBe(member.user.id);

    const returned = await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    expect(returned.body.status).toBe(LoanStatus.RETURNED);
    expect(Number(returned.body.fineAmount)).toBe(0);
  });

  it('devolución tardía → status returned y multa calculada con Math.ceil', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem('T-002');

    const loan = await createLoan(librarian.accessToken, member.user.id, item.id).expect(201);

    const ds = app.get(DataSource);
    const pastDue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await ds.query(`UPDATE loans SET "dueAt" = $1 WHERE id = $2`, [pastDue, loan.body.id]);

    const returned = await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    expect(returned.body.status).toBe(LoanStatus.RETURNED);
    expect(Number(returned.body.fineAmount)).toBeCloseTo(2.5, 1);
  });

  it('rechaza préstamo si ítem ya tiene préstamo activo (409)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const member2 = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem('T-003');

    await createLoan(librarian.accessToken, member.user.id, item.id).expect(201);
    await createLoan(librarian.accessToken, member2.user.id, item.id).expect(409);
  });

  it('rechaza préstamo si usuario ya tiene 3 activos (409)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const ds = app.get(DataSource);
    const itemRepo = ds.getRepository(Item);
    const loanRepo = ds.getRepository(Loan);

    for (let i = 0; i < 3; i++) {
      const item = await itemRepo.save(
        itemRepo.create({ code: `SEED-${i}`, title: `Libro ${i}`, type: ItemType.BOOK, isActive: true }),
      );
      const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await loanRepo.save(
        loanRepo.create({
          userId: member.user.id,
          itemId: item.id,
          loanedAt: new Date(),
          dueAt,
          status: LoanStatus.ACTIVE,
          returnedAt: null,
          fineAmount: null,
        }),
      );
    }

    const extra = await itemRepo.save(
      itemRepo.create({ code: 'EXTRA-1', title: 'Extra', type: ItemType.BOOK, isActive: true }),
    );
    await createLoan(librarian.accessToken, member.user.id, extra.id).expect(409);
  });

  it('rechaza dueAt inválido (pasado) con 400', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem('T-004');

    const pastDueAt = new Date(Date.now() - 1000).toISOString();
    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ userId: member.user.id, itemId: item.id, dueAt: pastDueAt })
      .expect(400);
  });

  it('MEMBER puede ver sus propios préstamos pero no los de otros', async () => {
    const member1 = await createUserWithRole(app, UserRole.MEMBER);
    const member2 = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item1 = await seedItem('T-005');
    const item2 = await seedItem('T-006');

    await createLoan(librarian.accessToken, member1.user.id, item1.id).expect(201);
    await createLoan(librarian.accessToken, member2.user.id, item2.id).expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/loans')
      .set('Authorization', `Bearer ${member1.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].userId).toBe(member1.user.id);
  });

  it('MEMBER no puede registrar una devolución (403)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem('T-007');

    const loan = await createLoan(librarian.accessToken, member.user.id, item.id).expect(201);

    await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('mark-lost cambia estado a lost y bloquea devolución posterior', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem('T-008');

    const loan = await createLoan(librarian.accessToken, member.user.id, item.id).expect(201);

    await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/mark-lost`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200)
      .expect((r) => expect(r.body.status).toBe(LoanStatus.LOST));

    await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(400);
  });
});
