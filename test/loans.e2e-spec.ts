import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';
import { createUserWithRole } from './helpers/auth.helper';
import { UserRole } from '../src/modules/users/entities/user.entity';
import { Item } from '../src/modules/items/entities/item.entity';
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

  async function seedItem(availableCopies = 3): Promise<Item> {
    const ds = app.get(DataSource);
    const repo = ds.getRepository(Item);
    return repo.save(
      repo.create({
        title: 'Libro Test',
        author: 'Autor Test',
        isbn: null,
        description: null,
        totalCopies: availableCopies,
        availableCopies,
        isActive: true,
      }),
    );
  }

  it('flujo completo: MEMBER pide préstamo → LIBRARIAN registra devolución a tiempo', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem(2);

    const loan = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ itemId: item.id })
      .expect(201);

    expect(loan.body.status).toBe(LoanStatus.ACTIVE);
    expect(loan.body.userId).toBe(member.user.id);

    const ds = app.get(DataSource);
    const itemAfter = await ds.getRepository(Item).findOneBy({ id: item.id });
    expect(itemAfter!.availableCopies).toBe(1);

    const returned = await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    expect(returned.body.status).toBe(LoanStatus.RETURNED);
    expect(returned.body.fineAmount).toBeNull();

    const itemRestored = await ds.getRepository(Item).findOneBy({ id: item.id });
    expect(itemRestored!.availableCopies).toBe(2);
  });

  it('LIBRARIAN registra devolución tardía → status OVERDUE y multa calculada', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem();

    const loan = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ itemId: item.id })
      .expect(201);

    // Forzar dueDate al pasado (5 días atrás)
    const ds = app.get(DataSource);
    const pastDue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await ds.getRepository(Loan).update(loan.body.id, { dueDate: pastDue });

    const returned = await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    expect(returned.body.status).toBe(LoanStatus.OVERDUE);
    expect(parseFloat(returned.body.fineAmount)).toBeGreaterThan(0);
    // 5 días × 0.50 = 2.50
    expect(parseFloat(returned.body.fineAmount)).toBeCloseTo(2.5, 1);
  });

  it('rechaza préstamo si no hay copias disponibles (400)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const item = await seedItem(0);

    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ itemId: item.id })
      .expect(400);
  });

  it(`rechaza préstamo si el usuario ya tiene ${process.env.MAX_ACTIVE_LOANS ?? 3} activos (400)`, async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const ds = app.get(DataSource);
    const itemRepo = ds.getRepository(Item);
    const loanRepo = ds.getRepository(Loan);

    // Crear 3 préstamos activos directamente en BD
    for (let i = 0; i < 3; i++) {
      const item = await itemRepo.save(
        itemRepo.create({
          title: `Libro ${i}`,
          author: 'A',
          totalCopies: 1,
          availableCopies: 0,
          isbn: null,
          description: null,
          isActive: true,
        }),
      );
      const due = new Date();
      due.setDate(due.getDate() + 30);
      await loanRepo.save(
        loanRepo.create({
          userId: member.user.id,
          itemId: item.id,
          loanDate: new Date(),
          dueDate: due,
          status: LoanStatus.ACTIVE,
          returnDate: null,
          fineAmount: null,
        }),
      );
    }

    const newItem = await itemRepo.save(
      itemRepo.create({
        title: 'Extra',
        author: 'A',
        totalCopies: 1,
        availableCopies: 1,
        isbn: null,
        description: null,
        isActive: true,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ itemId: newItem.id })
      .expect(400);
  });

  it('MEMBER solo ve sus propios préstamos', async () => {
    const member1 = await createUserWithRole(app, UserRole.MEMBER);
    const member2 = await createUserWithRole(app, UserRole.MEMBER);
    const item1 = await seedItem();
    const item2 = await seedItem();

    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member1.accessToken}`)
      .send({ itemId: item1.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member2.accessToken}`)
      .send({ itemId: item2.id })
      .expect(201);

    const list1 = await request(app.getHttpServer())
      .get('/api/loans')
      .set('Authorization', `Bearer ${member1.accessToken}`)
      .expect(200);
    expect(list1.body.data).toHaveLength(1);
    expect(list1.body.data[0].userId).toBe(member1.user.id);
  });

  it('LIBRARIAN ve todos los préstamos', async () => {
    const member1 = await createUserWithRole(app, UserRole.MEMBER);
    const member2 = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item1 = await seedItem();
    const item2 = await seedItem();

    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member1.accessToken}`)
      .send({ itemId: item1.id })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member2.accessToken}`)
      .send({ itemId: item2.id })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/loans')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(2);
  });

  it('MEMBER no puede registrar una devolución (403)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const item = await seedItem();

    const loan = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ itemId: item.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('devolución de préstamo ya devuelto responde 400', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await seedItem();

    const loan = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ itemId: item.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/loans/${loan.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(400);
  });
});
