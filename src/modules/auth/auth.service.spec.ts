import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: any;
  let jwt: any;
  let refreshRepo: any;

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'u-1',
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      passwordHash: '',
      role: UserRole.MEMBER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as User;

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('token-abc') };
    refreshRepo = {
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve({ id: 'rt-1', ...e })),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                'jwt.accessSecret': 'access-secret-32-chars-long-abcd',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'refresh-secret-32-chars-long-abcd',
                'jwt.refreshExpiresIn': '7d',
              };
              return map[key] ?? def;
            }),
          },
        },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('validateUser', () => {
    it('lanza UnauthorizedException si el usuario no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.validateUser('a@b.com', 'pw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      const u = makeUser({ isActive: false, passwordHash: await bcrypt.hash('correct', 10) });
      usersService.findByEmail.mockResolvedValue(u);
      await expect(service.validateUser('a@b.com', 'correct')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const u = makeUser({ passwordHash: await bcrypt.hash('correct', 10) });
      usersService.findByEmail.mockResolvedValue(u);
      await expect(service.validateUser('a@b.com', 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('retorna el usuario si las credenciales son válidas', async () => {
      const u = makeUser({ passwordHash: await bcrypt.hash('correct', 10) });
      usersService.findByEmail.mockResolvedValue(u);
      const out = await service.validateUser('a@b.com', 'correct');
      expect(out.id).toBe('u-1');
    });
  });

  describe('login', () => {
    it('genera access y refresh tokens y persiste el refresh', async () => {
      const u = makeUser({ passwordHash: await bcrypt.hash('pw12345678', 10) });
      usersService.findByEmail.mockResolvedValue(u);
      const res = await service.login({ email: 'a@b.com', password: 'pw12345678' });
      expect(res.accessToken).toBe('token-abc');
      expect(res.refreshToken).toBe('token-abc');
      expect(refreshRepo.save).toHaveBeenCalled();
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('register', () => {
    it('crea siempre con rol MEMBER por defecto', async () => {
      usersService.create.mockResolvedValue(makeUser());
      await service.register({
        email: 'n@n.com',
        password: 'pw12345678',
        firstName: 'N',
        lastName: 'N',
      });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.MEMBER }),
      );
    });

    it('respeta rol distinto solo si el actor es ADMIN', async () => {
      usersService.create.mockResolvedValue(makeUser({ role: UserRole.LIBRARIAN }));
      await service.register(
        {
          email: 'lib@n.com',
          password: 'pw12345678',
          firstName: 'L',
          lastName: 'L',
          role: UserRole.LIBRARIAN,
        },
        UserRole.ADMIN,
      );
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.LIBRARIAN }),
      );
    });

    it('ignora rol distinto si el actor no es ADMIN', async () => {
      usersService.create.mockResolvedValue(makeUser());
      await service.register(
        {
          email: 'x@n.com',
          password: 'pw12345678',
          firstName: 'X',
          lastName: 'X',
          role: UserRole.LIBRARIAN,
        },
        UserRole.MEMBER,
      );
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.MEMBER }),
      );
    });
  });

  describe('refresh', () => {
    it('lanza ForbiddenException si el token no existe', async () => {
      refreshRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh('rt', { sub: 'u-1', email: 'a@b.com' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lanza ForbiddenException si el token está revocado', async () => {
      refreshRepo.findOne.mockResolvedValue({
        token: 'rt',
        userId: 'u-1',
        expiresAt: new Date(Date.now() + 10000),
        revokedAt: new Date(),
      });
      await expect(service.refresh('rt', { sub: 'u-1', email: 'a@b.com' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lanza ForbiddenException si el token no corresponde al usuario', async () => {
      refreshRepo.findOne.mockResolvedValue({
        token: 'rt',
        userId: 'other',
        expiresAt: new Date(Date.now() + 10000),
        revokedAt: null,
      });
      await expect(service.refresh('rt', { sub: 'u-1', email: 'a@b.com' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('genera nuevo access token con token válido', async () => {
      refreshRepo.findOne.mockResolvedValue({
        token: 'rt',
        userId: 'u-1',
        expiresAt: new Date(Date.now() + 10000),
        revokedAt: null,
      });
      usersService.findById.mockResolvedValue(makeUser());
      const out = await service.refresh('rt', { sub: 'u-1', email: 'a@b.com' });
      expect(out.accessToken).toBe('token-abc');
    });
  });

  describe('logout', () => {
    it('marca el refresh token como revocado', async () => {
      const stored = { token: 'rt', userId: 'u-1', revokedAt: null };
      refreshRepo.findOne.mockResolvedValue(stored);
      await service.logout('u-1', 'rt');
      expect(stored.revokedAt).toBeInstanceOf(Date);
      expect(refreshRepo.save).toHaveBeenCalledWith(stored);
    });

    it('no hace nada si el token no existe', async () => {
      refreshRepo.findOne.mockResolvedValue(null);
      await service.logout('u-1', 'rt');
      expect(refreshRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('delega a usersService.findById', async () => {
      const u = makeUser();
      usersService.findById.mockResolvedValue(u);
      const out = await service.getCurrentUser('u-1');
      expect(out).toBe(u);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('elimina tokens expirados', async () => {
      await service.cleanupExpiredTokens();
      expect(refreshRepo.delete).toHaveBeenCalled();
    });
  });
});
