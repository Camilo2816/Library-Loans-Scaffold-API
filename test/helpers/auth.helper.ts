import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { User, UserRole } from '../../src/modules/users/entities/user.entity';

export interface TestUserCreds {
  user: User;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function createUserWithRole(
  app: INestApplication,
  role: UserRole,
  overrides: Partial<{ email: string; password: string; firstName: string; lastName: string }> = {},
): Promise<TestUserCreds> {
  const ds = app.get(DataSource);
  const repo = ds.getRepository(User);
  const email =
    overrides.email ??
    `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@library.test`;
  const password = overrides.password ?? 'TestPass123!';
  const hash = await bcrypt.hash(password, 4);

  const user = await repo.save(
    repo.create({
      email,
      passwordHash: hash,
      firstName: overrides.firstName ?? `First-${role}`,
      lastName: overrides.lastName ?? `Last-${role}`,
      role,
      isActive: true,
    }),
  );

  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    user,
    email,
    password,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}
