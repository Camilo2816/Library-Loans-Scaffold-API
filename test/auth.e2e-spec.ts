import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, destroyApp, truncateAll } from './helpers/test-app.factory';

describe('Auth (e2e)', () => {
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

  it('flujo completo: register → login → /me → refresh → logout → refresh falla', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'flow@library.test', password: 'StrongPass123!', firstName: 'Flow', lastName: 'User' })
      .expect(201);
    expect(reg.body.accessToken).toBeDefined();
    expect(reg.body.refreshToken).toBeDefined();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'flow@library.test', password: 'StrongPass123!' })
      .expect(200);

    const { accessToken, refreshToken } = login.body as { accessToken: string; refreshToken: string };

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('flow@library.test');

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);

    // token revocado tras logout
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(403);
  });

  it('register crea usuario con rol MEMBER por defecto', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'member@library.test', password: 'StrongPass123!', firstName: 'M', lastName: 'M' })
      .expect(201);
    expect(res.body.user.role).toBe('member');
  });

  it('rechaza login con contraseña incorrecta con 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'badpw@library.test', password: 'StrongPass123!', firstName: 'B', lastName: 'P' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'badpw@library.test', password: 'WrongPassword!' })
      .expect(401);
  });

  it('rechaza registro con email duplicado con 409', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dup@library.test', password: 'StrongPass123!', firstName: 'D', lastName: 'U' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dup@library.test', password: 'OtherPass123!', firstName: 'D2', lastName: 'U2' })
      .expect(409);
  });

  it('GET /api/auth/me sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rechaza body inválido en register con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: '123' })
      .expect(400);
  });
});
