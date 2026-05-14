import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LoansService } from './loans.service';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '@common/decorators/current-user.decorator';

describe('LoansService', () => {
  let service: LoansService;
  let loansRepo: any;
  let itemsRepo: any;
  let configService: any;

  const memberActor: AuthenticatedUser = { id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER };
  const adminActor: AuthenticatedUser = { id: 'admin-1', email: 'admin@b.com', role: UserRole.ADMIN };

  const makeItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: 'i-1',
      title: 'Libro',
      author: 'Autor',
      isbn: null,
      description: null,
      totalCopies: 3,
      availableCopies: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Item;

  const makeLoan = (overrides: Partial<Loan> = {}): Loan => {
    const loanDate = new Date();
    const dueDate = new Date(loanDate);
    dueDate.setDate(dueDate.getDate() + 30);
    return {
      id: 'l-1',
      userId: 'u-1',
      itemId: 'i-1',
      loanDate,
      dueDate,
      returnDate: null,
      status: LoanStatus.ACTIVE,
      fineAmount: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Loan;
  };

  beforeEach(async () => {
    loansRepo = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve({ id: 'l-new', ...e })),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    itemsRepo = {
      findOne: jest.fn(),
      save: jest.fn((e) => Promise.resolve(e)),
    };
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          'loans.maxActivePerUser': 3,
          'loans.maxLoanDays': 30,
          'loans.dailyFineRate': 0.5,
        };
        return map[key] ?? def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useValue: loansRepo },
        { provide: getRepositoryToken(Item), useValue: itemsRepo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(LoansService);
  });

  describe('create', () => {
    it('lanza BadRequestException si el usuario supera el límite de préstamos activos', async () => {
      loansRepo.count.mockResolvedValue(3);
      await expect(service.create({ itemId: 'i-1' }, memberActor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si el ítem no existe', async () => {
      loansRepo.count.mockResolvedValue(0);
      itemsRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ itemId: 'i-1' }, memberActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si no hay copias disponibles', async () => {
      loansRepo.count.mockResolvedValue(0);
      itemsRepo.findOne.mockResolvedValue(makeItem({ availableCopies: 0 }));
      await expect(service.create({ itemId: 'i-1' }, memberActor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('crea el préstamo, decrementa availableCopies y calcula dueDate', async () => {
      loansRepo.count.mockResolvedValue(0);
      const item = makeItem({ availableCopies: 2 });
      itemsRepo.findOne.mockResolvedValue(item);
      await service.create({ itemId: 'i-1' }, memberActor);
      expect(item.availableCopies).toBe(1);
      expect(itemsRepo.save).toHaveBeenCalledWith(item);
      expect(loansRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-1', itemId: 'i-1', status: LoanStatus.ACTIVE }),
      );
      const call = loansRepo.create.mock.calls[0][0] as Loan;
      const diffDays = Math.round(
        (call.dueDate.getTime() - call.loanDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(30);
    });
  });

  describe('findById', () => {
    it('lanza NotFoundException si el préstamo no existe', async () => {
      loansRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent', memberActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si un MEMBER intenta ver el préstamo de otro', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ userId: 'u-other' }));
      await expect(service.findById('l-1', memberActor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('un ADMIN puede ver el préstamo de cualquier usuario', async () => {
      const loan = makeLoan({ userId: 'u-other' });
      loansRepo.findOne.mockResolvedValue(loan);
      const out = await service.findById('l-1', adminActor);
      expect(out).toBe(loan);
    });
  });

  describe('returnLoan', () => {
    it('lanza NotFoundException si el préstamo no existe', async () => {
      loansRepo.findOne.mockResolvedValue(null);
      await expect(service.returnLoan('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza BadRequestException si el préstamo ya fue devuelto', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(service.returnLoan('l-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marca como RETURNED sin multa si se devuelve a tiempo', async () => {
      const loan = makeLoan();
      loan.item = makeItem();
      loansRepo.findOne.mockResolvedValue(loan);
      const result = await service.returnLoan('l-1');
      expect(loansRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LoanStatus.RETURNED, fineAmount: null }),
      );
      expect(result.status ?? loansRepo.save.mock.calls[0][0].status).toBe(LoanStatus.RETURNED);
    });

    it('marca como OVERDUE y calcula multa si se devuelve tarde', async () => {
      const pastDue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const loan = makeLoan({ dueDate: pastDue });
      loan.item = makeItem();
      loansRepo.findOne.mockResolvedValue(loan);
      await service.returnLoan('l-1');
      const saved = loansRepo.save.mock.calls[0][0] as Loan;
      expect(saved.status).toBe(LoanStatus.OVERDUE);
      expect(saved.fineAmount).toBeGreaterThan(0);
    });

    it('incrementa availableCopies del ítem al devolver', async () => {
      const item = makeItem({ availableCopies: 1 });
      const loan = makeLoan();
      loan.item = item;
      loansRepo.findOne.mockResolvedValue(loan);
      await service.returnLoan('l-1');
      expect(item.availableCopies).toBe(2);
      expect(itemsRepo.save).toHaveBeenCalledWith(item);
    });
  });
});
