import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@modules/users/entities/user.entity';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const ctx = (user: { role: UserRole; id: string } | undefined): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  it('permite paso si no hay roles requeridos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctx({ id: '1', role: UserRole.MEMBER }))).toBe(true);
  });

  it('permite paso si la lista de roles está vacía', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(ctx({ id: '1', role: UserRole.MEMBER }))).toBe(true);
  });

  it('lanza ForbiddenException si no hay usuario autenticado', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si el rol del usuario no está permitido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(ctx({ id: '1', role: UserRole.MEMBER }))).toThrow(
      ForbiddenException,
    );
  });

  it('permite paso si el rol del usuario está en la lista', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN, UserRole.LIBRARIAN]);
    expect(guard.canActivate(ctx({ id: '1', role: UserRole.LIBRARIAN }))).toBe(true);
  });

  it('permite paso al ADMIN cuando se requiere ADMIN', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(ctx({ id: '1', role: UserRole.ADMIN }))).toBe(true);
  });
});
