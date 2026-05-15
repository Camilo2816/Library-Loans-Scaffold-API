import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { Item, ItemType } from '../items/entities/item.entity';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '@common/decorators/current-user.decorator';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let reservationsRepo: any;
  let itemsRepo: any;

  const memberActor: AuthenticatedUser = { id: 'u-1', email: 'a@b.com', role: UserRole.MEMBER };
  const adminActor: AuthenticatedUser = { id: 'admin-1', email: 'admin@b.com', role: UserRole.ADMIN };

  const makeItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: 'i-1',
      code: 'LIB-001',
      title: 'El Quijote',
      type: ItemType.BOOK,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Item;

  const makeReservation = (overrides: Partial<Reservation> = {}): Reservation =>
    ({
      id: 'r-1',
      userId: 'u-1',
      itemId: 'i-1',
      status: ReservationStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Reservation;

  beforeEach(async () => {
    reservationsRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve({ id: 'r-new', ...e })),
      update: jest.fn(),
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getRepositoryToken(Reservation), useValue: reservationsRepo },
        { provide: getRepositoryToken(Item), useValue: itemsRepo },
      ],
    }).compile();

    service = module.get(ReservationsService);
  });

  describe('create', () => {
    it('crea una reserva pendiente exitosamente', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      reservationsRepo.findOne.mockResolvedValue(null);

      const result = await service.create({ itemId: 'i-1' }, memberActor);

      expect(reservationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          itemId: 'i-1',
          status: ReservationStatus.PENDING,
        }),
      );
      expect(result).toBeDefined();
    });

    it('lanza NotFoundException si el item no existe', async () => {
      itemsRepo.findOne.mockResolvedValue(null);

      await expect(service.create({ itemId: 'i-1' }, memberActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza ConflictException si ya hay reserva pendiente del mismo usuario para el mismo item', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      reservationsRepo.findOne.mockResolvedValue(makeReservation());

      await expect(service.create({ itemId: 'i-1' }, memberActor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('cancela una reserva pendiente propia', async () => {
      const reservation = makeReservation();
      reservationsRepo.findOne.mockResolvedValue(reservation);

      await service.cancel('r-1', memberActor);

      expect(reservationsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReservationStatus.CANCELLED }),
      );
    });

    it('lanza ForbiddenException si un MEMBER intenta cancelar la reserva de otro', async () => {
      reservationsRepo.findOne.mockResolvedValue(makeReservation({ userId: 'u-other' }));

      await expect(service.cancel('r-1', memberActor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza ConflictException si la reserva ya no está pendiente', async () => {
      reservationsRepo.findOne.mockResolvedValue(
        makeReservation({ status: ReservationStatus.FULFILLED }),
      );

      await expect(service.cancel('r-1', memberActor)).rejects.toBeInstanceOf(ConflictException);
    });

    it('un ADMIN puede cancelar la reserva de cualquier usuario', async () => {
      reservationsRepo.findOne.mockResolvedValue(makeReservation({ userId: 'u-other' }));

      await service.cancel('r-1', adminActor);

      expect(reservationsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReservationStatus.CANCELLED }),
      );
    });
  });

  describe('getNextPending (cola FIFO)', () => {
    it('retorna la primera reserva pendiente del item ordenada por createdAt', async () => {
      const oldest = makeReservation({ id: 'r-oldest', userId: 'u-2' });
      reservationsRepo.findOne.mockResolvedValue(oldest);

      const result = await service.getNextPending('i-1');

      expect(result?.id).toBe('r-oldest');
      expect(reservationsRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { itemId: 'i-1', status: ReservationStatus.PENDING },
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('retorna null si no hay reservas pendientes', async () => {
      reservationsRepo.findOne.mockResolvedValue(null);

      const result = await service.getNextPending('i-1');

      expect(result).toBeNull();
    });
  });

  describe('markFulfilled', () => {
    it('actualiza el status a FULFILLED', async () => {
      await service.markFulfilled('r-1');

      expect(reservationsRepo.update).toHaveBeenCalledWith('r-1', {
        status: ReservationStatus.FULFILLED,
      });
    });
  });
});
