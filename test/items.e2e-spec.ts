import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';
import { createUserWithRole } from './helpers/auth.helper';
import { UserRole } from '../src/modules/users/entities/user.entity';

describe('Items (e2e)', () => {
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

  function createItem(token: string, overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Libro Test', author: 'Autor Test', totalCopies: 3, ...overrides });
  }

  it('LIBRARIAN crea ítem; MEMBER lo lista; ADMIN lo elimina', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const admin = await createUserWithRole(app, UserRole.ADMIN);

    const created = await createItem(librarian.accessToken).expect(201);
    expect(created.body.title).toBe('Libro Test');
    expect(created.body.availableCopies).toBe(3);

    const list = await request(app.getHttpServer())
      .get('/api/items')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.total).toBe(1);

    await request(app.getHttpServer())
      .delete(`/api/items/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get('/api/items')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    expect(afterDelete.body.data).toHaveLength(0);
  });

  it('rechaza ISBN duplicado con 400', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    await createItem(librarian.accessToken, { isbn: '978-1-23-456789-0' }).expect(201);
    await createItem(librarian.accessToken, { isbn: '978-1-23-456789-0', title: 'Otro' }).expect(400);
  });

  it('MEMBER no puede crear ítems (403)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    await createItem(member.accessToken).expect(403);
  });

  it('LIBRARIAN puede actualizar un ítem', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await createItem(librarian.accessToken).expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/items/${item.body.id}`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ title: 'Título actualizado' })
      .expect(200);
    expect(updated.body.title).toBe('Título actualizado');
  });

  it('GET /api/items sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/api/items').expect(401);
  });

  it('busca ítems por título (search)', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    await createItem(librarian.accessToken, { title: 'Don Quijote', author: 'Cervantes' }).expect(201);
    await createItem(librarian.accessToken, { title: 'Cien años de soledad', author: 'García Márquez' }).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/items?search=Quijote')
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Don Quijote');
  });
});
