import { AuthController } from './auth.controller';
import { UserRole } from '../users/entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let service: any;

  beforeEach(() => {
    service = {
      register: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
      login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
      refresh: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
      logout: jest.fn().mockResolvedValue(undefined),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'u-1', email: 'a@b.com' }),
    };
    controller = new AuthController(service);
  });

  it('register delega al service', async () => {
    await controller.register({
      email: 'a@b.com', password: 'pw12345678', firstName: 'A', lastName: 'B',
    });
    expect(service.register).toHaveBeenCalled();
  });

  it('login delega al service', async () => {
    await controller.login({ email: 'a@b.com', password: 'pw12345678' });
    expect(service.login).toHaveBeenCalled();
  });

  it('refresh delega al service con sub y email del payload', async () => {
    await controller.refresh({ refreshToken: 'rt' }, { sub: 'u-1', email: 'a@b.com' });
    expect(service.refresh).toHaveBeenCalledWith('rt', { sub: 'u-1', email: 'a@b.com' });
  });

  it('logout delega al service con userId y refreshToken', async () => {
    await controller.logout(
      { refreshToken: 'rt' },
      { id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER },
    );
    expect(service.logout).toHaveBeenCalledWith('u-1', 'rt');
  });

  it('me delega a getCurrentUser con el id del actor', async () => {
    await controller.me({ id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER });
    expect(service.getCurrentUser).toHaveBeenCalledWith('u-1');
  });
});
