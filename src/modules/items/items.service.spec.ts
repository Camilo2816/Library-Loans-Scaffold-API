import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { Item } from './entities/item.entity';

describe('ItemsService', () => {
  let service: ItemsService;
  let repo: any;

  const makeItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: 'i-1',
      title: 'El Quijote',
      author: 'Cervantes',
      isbn: '978-3-16-148410-0',
      description: null,
      totalCopies: 3,
      availableCopies: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Item;

  beforeEach(async () => {
    repo = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useValue: repo },
      ],
    }).compile();

    service = module.get(ItemsService);
  });

  describe('create', () => {
    it('lanza BadRequestException si el ISBN ya existe', async () => {
      repo.findOne.mockResolvedValue(makeItem());
      await expect(
        service.create({ title: 'Otro', author: 'Autor', isbn: '978-3-16-148410-0' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea un ítem con copies iguales a totalCopies', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.create({ title: 'Libro', author: 'Autor', totalCopies: 5 });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalCopies: 5, availableCopies: 5 }),
      );
    });

    it('usa 1 copia por defecto si no se especifica totalCopies', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.create({ title: 'Libro', author: 'Autor' });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalCopies: 1, availableCopies: 1 }),
      );
    });
  });

  describe('findById', () => {
    it('lanza NotFoundException si el ítem no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna el ítem si existe', async () => {
      const item = makeItem();
      repo.findOne.mockResolvedValue(item);
      const out = await service.findById('i-1');
      expect(out).toBe(item);
    });
  });

  describe('update', () => {
    it('ajusta availableCopies proporcionalmente al cambiar totalCopies', async () => {
      const item = makeItem({ totalCopies: 3, availableCopies: 2 });
      repo.findOne.mockResolvedValue(item);
      await service.update('i-1', { totalCopies: 5 });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ availableCopies: 4, totalCopies: 5 }),
      );
    });
  });

  describe('remove', () => {
    it('lanza BadRequestException si hay préstamos activos', async () => {
      repo.findOne.mockResolvedValue(makeItem({ totalCopies: 3, availableCopies: 2 }));
      await expect(service.remove('i-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('desactiva el ítem si no hay préstamos activos', async () => {
      const item = makeItem({ totalCopies: 3, availableCopies: 3 });
      repo.findOne.mockResolvedValue(item);
      await service.remove('i-1');
      expect(item.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(item);
    });
  });
});
