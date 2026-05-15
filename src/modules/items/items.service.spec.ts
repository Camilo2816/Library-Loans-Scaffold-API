import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { Item, ItemType } from './entities/item.entity';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';

describe('ItemsService', () => {
  let service: ItemsService;
  let itemsRepo: any;
  let loansRepo: any;

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

  beforeEach(async () => {
    itemsRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve({ id: 'i-new', ...e })),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    loansRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useValue: itemsRepo },
        { provide: getRepositoryToken(Loan), useValue: loansRepo },
      ],
    }).compile();

    service = module.get(ItemsService);
  });

  describe('create', () => {
    it('lanza ConflictException si el código ya existe', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      await expect(
        service.create({ code: 'LIB-001', title: 'Otro', type: ItemType.BOOK }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea el ítem con code, title y type correctos', async () => {
      itemsRepo.findOne.mockResolvedValue(null);
      await service.create({ code: 'LIB-002', title: 'Libro', type: ItemType.MAGAZINE });
      expect(itemsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'LIB-002', title: 'Libro', type: ItemType.MAGAZINE }),
      );
    });

    it('retorna el ítem con isAvailable: true al crearlo', async () => {
      itemsRepo.findOne.mockResolvedValue(null);
      const result = await service.create({
        code: 'LIB-003',
        title: 'Nuevo',
        type: ItemType.EQUIPMENT,
      });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('findById', () => {
    it('lanza NotFoundException si el ítem no existe', async () => {
      itemsRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna el ítem con isAvailable calculado', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      loansRepo.find.mockResolvedValue([]); // sin préstamos activos
      const out = await service.findById('i-1');
      expect(out.id).toBe('i-1');
      expect(out.isAvailable).toBe(true);
    });

    it('retorna isAvailable: false si el ítem tiene préstamo activo', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      loansRepo.find.mockResolvedValue([{ itemId: 'i-1', status: LoanStatus.ACTIVE }]);
      const out = await service.findById('i-1');
      expect(out.isAvailable).toBe(false);
    });
  });

  describe('update', () => {
    it('actualiza title correctamente', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      await service.update('i-1', { title: 'Nuevo Título' });
      expect(itemsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nuevo Título' }),
      );
    });

    it('lanza NotFoundException si el ítem no existe', async () => {
      itemsRepo.findOne.mockResolvedValue(null);
      await expect(service.update('bad-id', { title: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('lanza BadRequestException si hay préstamos activos', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      loansRepo.findOne.mockResolvedValue({ id: 'l-1', status: LoanStatus.ACTIVE });
      await expect(service.remove('i-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('desactiva el ítem si no hay préstamos activos', async () => {
      const item = makeItem();
      itemsRepo.findOne.mockResolvedValue(item);
      loansRepo.findOne.mockResolvedValue(null);
      await service.remove('i-1');
      expect(item.isActive).toBe(false);
      expect(itemsRepo.save).toHaveBeenCalledWith(item);
    });
  });
});
