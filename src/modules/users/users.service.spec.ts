import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repo: any;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve({ id: 'u-1', ...entity })),
      createQueryBuilder: jest.fn(() => ({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(4) } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({ email: 'a@b.com', password: 'pw12345678', firstName: 'A', lastName: 'B' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashea el password antes de guardar (nunca almacena en plano)', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.create({
        email: 'new@b.com',
        password: 'pw12345678',
        firstName: 'N',
        lastName: 'N',
      });
      expect(created.passwordHash).toBeDefined();
      expect(created.passwordHash).not.toBe('pw12345678');
      const matches = await bcrypt.compare('pw12345678', created.passwordHash);
      expect(matches).toBe(true);
    });

    it('asigna rol MEMBER por defecto', async () => {
      repo.findOne.mockResolvedValue(null);
      const u = await service.create({
        email: 'x@b.com',
        password: 'pw12345678',
        firstName: 'X',
        lastName: 'X',
      });
      expect(u.role).toBe(UserRole.MEMBER);
    });

    it('usa el rol especificado cuando se proporciona', async () => {
      repo.findOne.mockResolvedValue(null);
      const u = await service.create({
        email: 'lib@b.com',
        password: 'pw12345678',
        firstName: 'L',
        lastName: 'L',
        role: UserRole.LIBRARIAN,
      });
      expect(u.role).toBe(UserRole.LIBRARIAN);
    });
  });

  describe('findById', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna el usuario si existe', async () => {
      const u = { id: 'u-1', email: 'a@b.com' } as User;
      repo.findOne.mockResolvedValue(u);
      const out = await service.findById('u-1');
      expect(out).toBe(u);
    });
  });

  describe('findByEmail', () => {
    it('retorna null si no existe ningún usuario con ese email', async () => {
      repo.findOne.mockResolvedValue(null);
      const out = await service.findByEmail('nobody@b.com');
      expect(out).toBeNull();
    });

    it('retorna el usuario si el email coincide', async () => {
      const u = { id: 'u-1', email: 'a@b.com' } as User;
      repo.findOne.mockResolvedValue(u);
      const out = await service.findByEmail('a@b.com');
      expect(out).toBe(u);
    });
  });

  describe('findAll', () => {
    it('retorna resultado paginado con page y limit correctos', async () => {
      const result = await service.findAll({ page: 2, limit: 5 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.total).toBe(0);
    });

    it('aplica filtro de rol si se especifica', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({ page: 1, limit: 10, role: UserRole.LIBRARIAN });
      expect(qb.andWhere).toHaveBeenCalledWith('u.role = :role', { role: UserRole.LIBRARIAN });
    });
  });

  describe('update', () => {
    it('lanza ForbiddenException si el actor no es dueño ni admin', async () => {
      repo.findOne.mockResolvedValue({ id: 'u-2', role: UserRole.MEMBER } as User);
      await expect(
        service.update('u-2', { firstName: 'X' }, { id: 'u-1', role: UserRole.MEMBER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza ForbiddenException si no-admin intenta cambiar el rol', async () => {
      repo.findOne.mockResolvedValue({ id: 'u-1', role: UserRole.MEMBER } as User);
      await expect(
        service.update('u-1', { role: UserRole.ADMIN }, { id: 'u-1', role: UserRole.MEMBER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admin puede cambiar el rol de cualquier usuario', async () => {
      repo.findOne.mockResolvedValue({ id: 'u-1', role: UserRole.MEMBER } as User);
      const u = await service.update(
        'u-1',
        { role: UserRole.LIBRARIAN },
        { id: 'admin', role: UserRole.ADMIN },
      );
      expect(u.role).toBe(UserRole.LIBRARIAN);
    });
  });

  describe('softDelete', () => {
    it('marca isActive = false', async () => {
      repo.findOne.mockResolvedValue({ id: 'u-1', isActive: true } as User);
      const updated = await service.softDelete('u-1');
      expect(updated.isActive).toBe(false);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.softDelete('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
