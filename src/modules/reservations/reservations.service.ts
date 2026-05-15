import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { Item } from '../items/entities/item.entity';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { PaginatedResult } from '../users/users.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { FindReservationsDto } from './dto/find-reservations.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepo: Repository<Reservation>,
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
  ) {}

  async create(dto: CreateReservationDto, actor: AuthenticatedUser): Promise<Reservation> {
    const item = await this.itemsRepo.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) {
      throw new NotFoundException(`Ítem ${dto.itemId} no encontrado`);
    }

    const existing = await this.reservationsRepo.findOne({
      where: { userId: actor.id, itemId: dto.itemId, status: ReservationStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException('Ya tienes una reserva pendiente para este ítem');
    }

    const reservation = this.reservationsRepo.create({
      userId: actor.id,
      itemId: dto.itemId,
      status: ReservationStatus.PENDING,
    });
    return this.reservationsRepo.save(reservation);
  }

  async findAll(
    query: FindReservationsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<Reservation>> {
    const { page, limit, status, itemId, userId } = query;
    const isStaff = actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN;

    const qb = this.reservationsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('r.user', 'user');

    if (!isStaff) {
      qb.where('r.userId = :uid', { uid: actor.id });
    } else if (userId) {
      qb.where('r.userId = :uid', { uid: userId });
    }

    if (itemId) qb.andWhere('r.itemId = :itemId', { itemId });
    if (status) qb.andWhere('r.status = :status', { status });

    qb.orderBy('r.createdAt', 'ASC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string, actor: AuthenticatedUser): Promise<Reservation> {
    const reservation = await this.reservationsRepo.findOne({
      where: { id },
      relations: ['item', 'user'],
    });
    if (!reservation) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }
    const isStaff = actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN;
    if (!isStaff && reservation.userId !== actor.id) {
      throw new ForbiddenException('No autorizado para ver esta reserva');
    }
    return reservation;
  }

  async cancel(id: string, actor: AuthenticatedUser): Promise<Reservation> {
    const reservation = await this.reservationsRepo.findOne({ where: { id } });
    if (!reservation) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }
    const isStaff = actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN;
    if (!isStaff && reservation.userId !== actor.id) {
      throw new ForbiddenException('No autorizado para cancelar esta reserva');
    }
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ConflictException(
        `No se puede cancelar una reserva en estado "${reservation.status}"`,
      );
    }
    reservation.status = ReservationStatus.CANCELLED;
    return this.reservationsRepo.save(reservation);
  }

  async getNextPending(itemId: string): Promise<Reservation | null> {
    return this.reservationsRepo.findOne({
      where: { itemId, status: ReservationStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async markFulfilled(id: string): Promise<void> {
    await this.reservationsRepo.update(id, { status: ReservationStatus.FULFILLED });
  }
}
