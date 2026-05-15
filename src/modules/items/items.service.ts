import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { FindItemsDto } from './dto/find-items.dto';
import { PaginatedResult } from '../users/users.service';

export type ItemWithAvailability = Item & { isAvailable: boolean };

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
    @InjectRepository(Loan)
    private readonly loansRepo: Repository<Loan>,
  ) {}

  async create(dto: CreateItemDto): Promise<ItemWithAvailability> {
    const existing = await this.itemsRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`El código ${dto.code} ya está registrado`);
    }
    const item = this.itemsRepo.create({
      code: dto.code,
      title: dto.title,
      type: dto.type,
      isActive: true,
    });
    const saved = await this.itemsRepo.save(item);
    return { ...saved, isAvailable: true };
  }

  async findAll(query: FindItemsDto): Promise<PaginatedResult<ItemWithAvailability>> {
    const { page, limit, type } = query;
    const qb = this.itemsRepo.createQueryBuilder('i').where('i.isActive = true');
    if (type) {
      qb.andWhere('i.type = :type', { type });
    }
    qb.orderBy('i.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    const data = await this.attachAvailability(items);
    return { data, total, page, limit };
  }

  async findById(id: string): Promise<ItemWithAvailability> {
    const item = await this.itemsRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Ítem ${id} no encontrado`);
    }
    const [withAvail] = await this.attachAvailability([item]);
    return withAvail;
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemWithAvailability> {
    const item = await this.itemsRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Ítem ${id} no encontrado`);
    }
    Object.assign(item, dto);
    const saved = await this.itemsRepo.save(item);
    const [withAvail] = await this.attachAvailability([saved]);
    return withAvail;
  }

  async remove(id: string): Promise<Item> {
    const item = await this.itemsRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Ítem ${id} no encontrado`);
    }
    const activeLoan = await this.loansRepo.findOne({
      where: { itemId: id, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (activeLoan) {
      throw new BadRequestException('No se puede eliminar un ítem con préstamos activos');
    }
    item.isActive = false;
    return this.itemsRepo.save(item);
  }

  private async attachAvailability(items: Item[]): Promise<ItemWithAvailability[]> {
    if (items.length === 0) return [];
    const ids = items.map((i) => i.id);
    const busyLoans = await this.loansRepo.find({
      where: ids.map((itemId) => ({ itemId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) })),
      select: ['itemId'],
    });
    const busySet = new Set(busyLoans.map((l) => l.itemId));
    return items.map((item) => ({ ...item, isAvailable: !busySet.has(item.id) }));
  }
}
