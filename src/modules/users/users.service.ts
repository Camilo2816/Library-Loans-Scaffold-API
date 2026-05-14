import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindUsersDto } from './dto/find-users.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }
    const saltRounds = this.configService.get<number>('bcrypt.saltRounds', 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);
    const user = this.usersRepo.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      role: dto.role ?? UserRole.MEMBER,
      isActive: true,
    });
    return this.usersRepo.save(user);
  }

  async findAll(query: FindUsersDto): Promise<PaginatedResult<User>> {
    const { page, limit, role } = query;
    const qb = this.usersRepo.createQueryBuilder('u');
    if (role) {
      qb.andWhere('u.role = :role', { role });
    }
    qb.orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: { id: string; role: UserRole },
  ): Promise<User> {
    const user = await this.findById(id);

    if (actor.id !== user.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('No autorizado para modificar este usuario');
    }
    if (dto.role && dto.role !== user.role && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo un admin puede cambiar el rol');
    }

    Object.assign(user, dto);
    return this.usersRepo.save(user);
  }

  async softDelete(id: string): Promise<User> {
    const user = await this.findById(id);
    user.isActive = false;
    return this.usersRepo.save(user);
  }
}
