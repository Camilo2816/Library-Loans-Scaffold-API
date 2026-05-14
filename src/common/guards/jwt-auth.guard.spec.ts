import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  const ctx = (): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  it('permite paso si el endpoint tiene @Public()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('delega a super.canActivate si el endpoint no es público', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);
    expect(guard.canActivate(ctx())).toBe(true);
    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });
});
