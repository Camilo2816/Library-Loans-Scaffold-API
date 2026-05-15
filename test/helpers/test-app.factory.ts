import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

function applyTestEnv(): void {
  process.env.NODE_ENV ??= 'test';
  process.env.PORT ??= '0';
  process.env.API_PREFIX ??= 'api';
  process.env.SWAGGER_ENABLED ??= 'false';
  process.env.DB_HOST ??= 'localhost';
  process.env.DB_PORT ??= '5433';
  process.env.DB_USER ??= 'loans';
  process.env.DB_PASSWORD ??= 'loans';
  process.env.DB_NAME ??= 'loans';
  process.env.DB_SYNCHRONIZE ??= 'true';
  process.env.DB_LOGGING ??= 'false';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-must-be-32-chars-min';
  process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-must-be-32-chars-min';
  process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';
  process.env.BCRYPT_SALT_ROUNDS ??= '4';
  process.env.MAX_ACTIVE_LOANS ??= '3';
  process.env.DAILY_FINE_RATE ??= '0.50';
  process.env.MAX_LOAN_DAYS ??= '30';
}

export async function createTestApp(): Promise<INestApplication> {
  applyTestEnv();
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

export async function truncateAll(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  await ds.query(
    'TRUNCATE TABLE "reservations", "loans", "refresh_tokens", "items", "users" RESTART IDENTITY CASCADE',
  );
}

export async function destroyApp(app: INestApplication | undefined): Promise<void> {
  if (!app) return;
  try {
    const ds = app.get(DataSource);
    if (ds.isInitialized) await ds.destroy();
  } catch {}
  await app.close();
}
