import { LoansController } from './loans.controller';
import { LoanStatus } from './entities/loan.entity';
import { UserRole } from '../users/entities/user.entity';

describe('LoansController', () => {
  let controller: LoansController;
  let service: any;

  const memberActor = { id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER };
  const adminActor = { id: 'admin', email: 'admin@b.com', role: UserRole.ADMIN };
  const mockLoan = {
    id: 'l-1',
    userId: 'u-1',
    itemId: 'i-1',
    status: LoanStatus.ACTIVE,
    fineAmount: null,
  };

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue(mockLoan),
      findAll: jest.fn().mockResolvedValue({ data: [mockLoan], total: 1, page: 1, limit: 20 }),
      findById: jest.fn().mockResolvedValue(mockLoan),
      returnLoan: jest.fn().mockResolvedValue({ ...mockLoan, status: LoanStatus.RETURNED }),
      markLost: jest.fn().mockResolvedValue({ ...mockLoan, status: LoanStatus.LOST }),
    };
    controller = new LoansController(service);
  });

  it('create delega al service con dto y actor', async () => {
    const dto = { userId: 'u-1', itemId: 'i-1', dueAt: '2026-06-15T00:00:00.000Z' };
    await controller.create(dto, memberActor);
    expect(service.create).toHaveBeenCalledWith(dto, memberActor);
  });

  it('findAll delega al service con query y actor', async () => {
    const query = { page: 1, limit: 20 };
    const result = await controller.findAll(query, memberActor);
    expect(service.findAll).toHaveBeenCalledWith(query, memberActor);
    expect(result.data).toHaveLength(1);
  });

  it('findOne delega al service con id y actor', async () => {
    const out = await controller.findOne('l-1', adminActor);
    expect(service.findById).toHaveBeenCalledWith('l-1', adminActor);
    expect(out.id).toBe('l-1');
  });

  it('returnLoan delega al service con el id del préstamo', async () => {
    const out = await controller.returnLoan('l-1');
    expect(service.returnLoan).toHaveBeenCalledWith('l-1');
    expect(out.status).toBe(LoanStatus.RETURNED);
  });

  it('markLost delega al service con el id del préstamo', async () => {
    const out = await controller.markLost('l-1');
    expect(service.markLost).toHaveBeenCalledWith('l-1');
    expect(out.status).toBe(LoanStatus.LOST);
  });
});
