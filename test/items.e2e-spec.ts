import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';
import { createUserWithRole } from './helpers/auth.helper';
import { UserRole } from '../src/modules/users/entities/user.entity';
import { ItemType } from '../src/modules/items/entities/item.entity';

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
      .send({ code: 'LIB-001', title: 'Libro Test', type: ItemType.BOOK, ...overrides });
  }

  it('LIBRARIAN crea ítem; MEMBER lo lista con isAvailable; ADMIN lo elimina', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const member = await createUserWithRole(app, UserRole.MEMBER);
    const admin = await createUserWithRole(app, UserRole.ADMIN);

    const created = await createItem(librarian.accessToken).expect(201);
    expect(created.body.code).toBe('LIB-001');
    expect(created.body.type).toBe(ItemType.BOOK);
    expect(created.body.isAvailable).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/items')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].isAvailable).toBe(true);

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

  it('rechaza código duplicado con 409', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    await createItem(librarian.accessToken, { code: 'DUP-001' }).expect(201);
    await createItem(librarian.accessToken, { code: 'DUP-001', title: 'Otro' }).expect(409);
  });

  it('MEMBER no puede crear ítems (403)', async () => {
    const member = await createUserWithRole(app, UserRole.MEMBER);
    await createItem(member.accessToken).expect(403);
  });

  it('LIBRARIAN puede actualizar title y type de un ítem', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    const item = await createItem(librarian.accessToken).expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/items/${item.body.id}`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .send({ title: 'Título actualizado', type: ItemType.MAGAZINE })
      .expect(200);
    expect(updated.body.title).toBe('Título actualizado');
    expect(updated.body.type).toBe(ItemType.MAGAZINE);
  });

  it('GET /api/items sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/api/items').expect(401);
  });

  it('filtra ítems por type', async () => {
    const librarian = await createUserWithRole(app, UserRole.LIBRARIAN);
    await createItem(librarian.accessToken, { code: 'B-001', type: ItemType.BOOK }).expect(201);
    await createItem(librarian.accessToken, {
      code: 'M-001',
      title: 'Revista',
      type: ItemType.MAGAZINE,
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/items?type=${ItemType.BOOK}`)
      .set('Authorization', `Bearer ${librarian.accessToken}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe(ItemType.BOOK);
  });
});
