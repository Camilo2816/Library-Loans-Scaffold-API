import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item, ItemType } from '../items/entities/item.entity';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { ReservationsService } from '../reservations/reservations.service';

describe('LoansService', () => {
  let service: LoansService;
  let loansRepo: any;
  let itemsRepo: any;
  let configService: any;
  let reservationsService: any;

  const memberActor: AuthenticatedUser = { id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER };
  const adminActor: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@b.com',
    role: UserRole.ADMIN,
  };

  const makeItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: 'i-1',
      code: 'LIB-001',
      title: 'Libro',
      type: ItemType.BOOK,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Item;

  const makeLoan = (overrides: Partial<Loan> = {}): Loan => {
    const loanedAt = new Date();
    const dueAt = new Date(loanedAt);
    dueAt.setDate(dueAt.getDate() + 30);
    return {
      id: 'l-1',
      userId: 'u-1',
      itemId: 'i-1',
      loanedAt,
      dueAt,
      returnedAt: null,
      status: LoanStatus.ACTIVE,
      fineAmount: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Loan;
  };

  const futureDueAt = () => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString();
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
    reservationsService = {
      getNextPending: jest.fn().mockResolvedValue(null),
      markFulfilled: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useValue: loansRepo },
        { provide: getRepositoryToken(Item), useValue: itemsRepo },
        { provide: ConfigService, useValue: configService },
        { provide: ReservationsService, useValue: reservationsService },
      ],
    }).compile();

    service = module.get(LoansService);
  });

  // ─── Caso obligatorio 1: Crear préstamo exitoso ────────────────────────────
  describe('create — caso exitoso', () => {
    it('crea el préstamo con los campos correctos cuando todo es válido', async () => {
      loansRepo.count.mockResolvedValue(0);
      loansRepo.findOne.mockResolvedValue(null); // item sin préstamo activo
      itemsRepo.findOne.mockResolvedValue(makeItem());

      const dto = { userId: 'u-1', itemId: 'i-1', dueAt: futureDueAt() };
      await service.create(dto, memberActor);

      expect(loansRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          itemId: 'i-1',
          status: LoanStatus.ACTIVE,
          returnedAt: null,
        }),
      );
      expect(loansRepo.save).toHaveBeenCalled();
    });

    it('lanza BadRequestException si dueAt no es posterior a hoy', async () => {
      loansRepo.count.mockResolvedValue(0);
      const pastDueAt = new Date(Date.now() - 1000).toISOString();
      await expect(
        service.create({ userId: 'u-1', itemId: 'i-1', dueAt: pastDueAt }, memberActor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequestException si dueAt supera MAX_LOAN_DAYS', async () => {
      loansRepo.count.mockResolvedValue(0);
      const farFuture = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
      await expect(
        service.create({ userId: 'u-1', itemId: 'i-1', dueAt: farFuture }, memberActor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Caso obligatorio 2: Item ya prestado → 409 ───────────────────────────
  describe('create — item ya prestado (R2)', () => {
    it('lanza ConflictException (409) si el item ya tiene un préstamo activo', async () => {
      loansRepo.count.mockResolvedValue(0);
      itemsRepo.findOne.mockResolvedValue(makeItem());
      loansRepo.findOne.mockResolvedValue(makeLoan()); // item ocupado

      await expect(
        service.create({ userId: 'u-1', itemId: 'i-1', dueAt: futureDueAt() }, memberActor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── Caso obligatorio 3: Usuario supera límite → 409 ──────────────────────
  describe('create — usuario supera límite (R3)', () => {
    it('lanza ConflictException (409) si el usuario ya tiene 3 préstamos activos', async () => {
      loansRepo.count.mockResolvedValue(3);

      await expect(
        service.create({ userId: 'u-1', itemId: 'i-1', dueAt: futureDueAt() }, memberActor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── Caso obligatorio 4: Cálculo de multa con Math.ceil ───────────────────
  describe('returnLoan — cálculo de multa (R4)', () => {
    it('calcula multa de 2.50 USD por 5 días de retraso (Math.ceil)', async () => {
      const pastDue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const loan = makeLoan({ dueAt: pastDue });
      loansRepo.findOne.mockResolvedValue(loan);

      await service.returnLoan('l-1');

      const saved = loansRepo.save.mock.calls[0][0] as Loan;
      expect(saved.status).toBe(LoanStatus.RETURNED);
      expect(saved.fineAmount).toBe(2.5);
    });

    it('no aplica multa si se devuelve a tiempo (fineAmount = 0)', async () => {
      const loan = makeLoan();
      loansRepo.findOne.mockResolvedValue(loan);

      await service.returnLoan('l-1');

      const saved = loansRepo.save.mock.calls[0][0] as Loan;
      expect(saved.status).toBe(LoanStatus.RETURNED);
      expect(saved.fineAmount).toBe(0);
    });

    it('acepta devolver un préstamo en estado overdue', async () => {
      const pastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const loan = makeLoan({ status: LoanStatus.OVERDUE, dueAt: pastDue });
      loansRepo.findOne.mockResolvedValue(loan);

      await service.returnLoan('l-1');

      const saved = loansRepo.save.mock.calls[0][0] as Loan;
      expect(saved.status).toBe(LoanStatus.RETURNED);
      expect(saved.fineAmount).toBeGreaterThan(0);
    });

    it('lanza BadRequestException si el préstamo ya está en estado terminal', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(service.returnLoan('l-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── FSM: markLost ────────────────────────────────────────────────────────
  describe('markLost', () => {
    it('marca como lost un préstamo active', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.ACTIVE }));
      await service.markLost('l-1');
      const saved = loansRepo.save.mock.calls[0][0] as Loan;
      expect(saved.status).toBe(LoanStatus.LOST);
    });

    it('marca como lost un préstamo overdue', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.OVERDUE }));
      await service.markLost('l-1');
      const saved = loansRepo.save.mock.calls[0][0] as Loan;
      expect(saved.status).toBe(LoanStatus.LOST);
    });

    it('lanza BadRequestException si el préstamo ya está en estado terminal', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.LOST }));
      await expect(service.markLost('l-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── FIFO: fulfillNextReservation on return ───────────────────────────────
  describe('returnLoan — FIFO reservations', () => {
    it('crea un préstamo para la siguiente reserva pendiente al devolver', async () => {
      const loan = makeLoan();
      loansRepo.findOne.mockResolvedValue(loan);
      reservationsService.getNextPending.mockResolvedValue({
        id: 'r-1',
        userId: 'u-2',
        itemId: 'i-1',
      });

      await service.returnLoan('l-1');

      expect(reservationsService.getNextPending).toHaveBeenCalledWith('i-1');
      expect(loansRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-2', itemId: 'i-1', status: LoanStatus.ACTIVE }),
      );
      expect(reservationsService.markFulfilled).toHaveBeenCalledWith('r-1');
    });

    it('no crea préstamo si no hay reservas pendientes', async () => {
      const loan = makeLoan();
      loansRepo.findOne.mockResolvedValue(loan);
      reservationsService.getNextPending.mockResolvedValue(null);

      await service.returnLoan('l-1');

      expect(loansRepo.create).not.toHaveBeenCalled();
      expect(reservationsService.markFulfilled).not.toHaveBeenCalled();
    });
  });

  // ─── findById ─────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('lanza NotFoundException si el préstamo no existe', async () => {
      loansRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent', memberActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si un MEMBER intenta ver el préstamo de otro', async () => {
      loansRepo.findOne.mockResolvedValue(makeLoan({ userId: 'u-other' }));
      await expect(service.findById('l-1', memberActor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un ADMIN puede ver el préstamo de cualquier usuario', async () => {
      const loan = makeLoan({ userId: 'u-other' });
      loansRepo.findOne.mockResolvedValue(loan);
      const out = await service.findById('l-1', adminActor);
      expect(out).toBe(loan);
    });
  });
});
