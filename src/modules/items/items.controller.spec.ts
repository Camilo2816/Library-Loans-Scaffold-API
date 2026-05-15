import { ItemsController } from './items.controller';
import { ItemType } from './entities/item.entity';

describe('ItemsController', () => {
  let controller: ItemsController;
  let service: any;

  const mockItem = { id: 'i-1', code: 'LIB-001', title: 'Libro', type: ItemType.BOOK, isAvailable: true };

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue(mockItem),
      findAll: jest.fn().mockResolvedValue({ data: [mockItem], total: 1, page: 1, limit: 20 }),
      findById: jest.fn().mockResolvedValue(mockItem),
      update: jest.fn().mockResolvedValue({ ...mockItem, title: 'Actualizado' }),
      remove: jest.fn().mockResolvedValue({ ...mockItem, isActive: false }),
    };
    controller = new ItemsController(service);
  });

  it('create delega al service', async () => {
    const dto = { code: 'LIB-001', title: 'Libro', type: ItemType.BOOK };
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll delega al service con query', async () => {
    const query = { page: 1, limit: 20 };
    const result = await controller.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result.data).toHaveLength(1);
  });

  it('findOne delega al service con el id', async () => {
    const out = await controller.findOne('i-1');
    expect(service.findById).toHaveBeenCalledWith('i-1');
    expect(out.id).toBe('i-1');
  });

  it('update delega al service con id y dto', async () => {
    await controller.update('i-1', { title: 'Actualizado' });
    expect(service.update).toHaveBeenCalledWith('i-1', { title: 'Actualizado' });
  });

  it('remove delega al service y retorna ítem inactivo', async () => {
    const out = await controller.remove('i-1');
    expect(service.remove).toHaveBeenCalledWith('i-1');
    expect(out.isActive).toBe(false);
  });
});
