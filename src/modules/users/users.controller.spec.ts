import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserRole } from './entities/user.entity';

describe('UsersController', () => {
  let controller: UsersController;
  let service: any;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      findById: jest.fn().mockResolvedValue({ id: 'u-1', email: 'a@b.com' }),
      update: jest.fn().mockResolvedValue({ id: 'u-1', firstName: 'Nuevo' }),
      softDelete: jest.fn().mockResolvedValue({ id: 'u-1', isActive: false }),
    };
    controller = new UsersController(service);
  });

  it('findAll delega al service', async () => {
    await controller.findAll({ page: 1, limit: 20 });
    expect(service.findAll).toHaveBeenCalled();
  });

  it('findOne lanza ForbiddenException si el actor intenta ver a otro sin ser admin', async () => {
    await expect(
      controller.findOne('u-1', { id: 'u-2', email: 'b@b.com', role: UserRole.MEMBER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne permite al propio usuario ver sus datos', async () => {
    const out = await controller.findOne('u-1', {
      id: 'u-1',
      email: 'a@b.com',
      role: UserRole.MEMBER,
    });
    expect(out.id).toBe('u-1');
  });

  it('findOne permite al ADMIN ver cualquier usuario', async () => {
    const out = await controller.findOne('u-1', {
      id: 'admin',
      email: 'admin@b.com',
      role: UserRole.ADMIN,
    });
    expect(out.id).toBe('u-1');
  });

  it('update delega al service con actor', async () => {
    const actor = { id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER };
    await controller.update('u-1', { firstName: 'Nuevo' }, actor);
    expect(service.update).toHaveBeenCalledWith('u-1', { firstName: 'Nuevo' }, actor);
  });

  it('remove delega a softDelete y retorna usuario inactivo', async () => {
    const out = await controller.remove('u-1');
    expect(service.softDelete).toHaveBeenCalledWith('u-1');
    expect(out.isActive).toBe(false);
  });
});
