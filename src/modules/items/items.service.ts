import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { FindItemsDto } from './dto/find-items.dto';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    if (dto.isbn) {
      const existing = await this.itemsRepo.findOne({ where: { isbn: dto.isbn } });
      if (existing) {
        throw new BadRequestException(`El ISBN ${dto.isbn} ya está registrado`);
      }
    }
    const copies = dto.totalCopies ?? 1;
    const item = this.itemsRepo.create({
      title: dto.title,
      author: dto.author,
      isbn: dto.isbn ?? null,
      description: dto.description ?? null,
      totalCopies: copies,
      availableCopies: copies,
      isActive: true,
    });
    return this.itemsRepo.save(item);
  }

  async findAll(query: FindItemsDto): Promise<PaginatedResult<Item>> {
    const { page, limit, search } = query;
    const qb = this.itemsRepo.createQueryBuilder('i').where('i.isActive = true');
    if (search) {
      qb.andWhere('(i.title ILIKE :search OR i.author ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    qb.orderBy('i.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string): Promise<Item> {
    const item = await this.itemsRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Ítem ${id} no encontrado`);
    }
    return item;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.findById(id);
    if (dto.totalCopies !== undefined) {
      const diff = dto.totalCopies - item.totalCopies;
      item.availableCopies = Math.max(0, item.availableCopies + diff);
    }
    Object.assign(item, dto);
    return this.itemsRepo.save(item);
  }

  async remove(id: string): Promise<Item> {
    const item = await this.findById(id);
    if (item.totalCopies !== item.availableCopies) {
      throw new BadRequestException('No se puede eliminar un ítem con préstamos activos');
    }
    item.isActive = false;
    return this.itemsRepo.save(item);
  }
}
