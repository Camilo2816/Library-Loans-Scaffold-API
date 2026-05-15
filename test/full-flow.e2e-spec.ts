import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';
import { createUserWithRole } from './helpers/auth.helper';
import { UserRole } from '../src/modules/users/entities/user.entity';
import { LoanStatus } from '../src/modules/loans/entities/loan.entity';
import { ItemType } from '../src/modules/items/entities/item.entity';

describe('Full flow (e2e): register → login → create item → create loan → return loan', () => {
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

  it('flujo completo sin retraso → multa 0', async () => {
    // 1. Register — member se registra vía API
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'member@flow.test',
        password: 'StrongPass123!',
        firstName: 'Flow',
        lastName: 'Member',
      })
      .expect(201);

    expect(registerRes.body.accessToken).toBeDefined();
    expect(registerRes.body.user.role).toBe('member');

    // 2. Login — member obtiene tokens
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'member@flow.test', password: 'StrongPass123!' })
      .expect(200);

    const memberToken = loginRes.body.accessToken as string;
    const memberId = loginRes.body.user.id as string;

    // LIBRARIAN creado vía helper para operaciones de staff
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);

    // 3. Create item — LIBRARIAN crea el ítem
    const itemRes = await request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ code: 'FLOW-001', title: 'Clean Code', type: ItemType.BOOK })
      .expect(201);

    expect(itemRes.body.code).toBe('FLOW-001');
    expect(itemRes.body.isAvailable).toBe(true);

    // 4. Create loan — LIBRARIAN registra préstamo para el MEMBER
    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const loanRes = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ userId: memberId, itemId: itemRes.body.id, dueAt })
      .expect(201);

    expect(loanRes.body.status).toBe(LoanStatus.ACTIVE);
    expect(loanRes.body.userId).toBe(memberId);

    // item ahora no disponible
    const itemBusy = await request(app.getHttpServer())
      .get(`/api/items/${itemRes.body.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(itemBusy.body.isAvailable).toBe(false);

    // MEMBER puede ver su propio préstamo
    const loanView = await request(app.getHttpServer())
      .get(`/api/loans/${loanRes.body.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(loanView.body.id).toBe(loanRes.body.id);

    // 5. Return loan — LIBRARIAN registra devolución a tiempo
    const returnRes = await request(app.getHttpServer())
      .patch(`/api/loans/${loanRes.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    expect(returnRes.body.status).toBe(LoanStatus.RETURNED);
    expect(Number(returnRes.body.fineAmount)).toBe(0);

    // item disponible de nuevo
    const itemFree = await request(app.getHttpServer())
      .get(`/api/items/${itemRes.body.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(itemFree.body.isAvailable).toBe(true);
  });

  it('flujo con retraso → multa calculada con Math.ceil', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const member = await createUserWithRole(app, UserRole.MEMBER);

    const itemRes = await request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ code: 'FLOW-002', title: 'Refactoring', type: ItemType.BOOK })
      .expect(201);

    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const loanRes = await request(app.getHttpServer())
      .post('/api/loans')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ userId: member.user.id, itemId: itemRes.body.id, dueAt })
      .expect(201);

    // Forzar dueAt 5 días atrás directamente en BD
    const { DataSource } = await import('typeorm');
    const ds = app.get(DataSource);
    const pastDue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await ds.query(`UPDATE loans SET "dueAt" = $1 WHERE id = $2`, [pastDue, loanRes.body.id]);

    const returnRes = await request(app.getHttpServer())
      .patch(`/api/loans/${loanRes.body.id}/return`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);

    // status returned (no overdue) con multa ≥ 2.50
    expect(returnRes.body.status).toBe(LoanStatus.RETURNED);
    expect(Number(returnRes.body.fineAmount)).toBeGreaterThanOrEqual(2.5);
  });
});
