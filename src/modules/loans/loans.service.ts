import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FindLoansDto } from './dto/find-loans.dto';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { PaginatedResult } from '../users/users.service';

const TERMINAL_STATUSES = [LoanStatus.RETURNED, LoanStatus.LOST];
const RETURNABLE_STATUSES = [LoanStatus.ACTIVE, LoanStatus.OVERDUE];

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loansRepo: Repository<Loan>,
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateLoanDto, actor: AuthenticatedUser): Promise<Loan> {
    void actor;
    const maxActiveLoans = this.configService.get<number>('loans.maxActivePerUser', 3);
    const maxLoanDays = this.configService.get<number>('loans.maxLoanDays', 30);

    const loanedAt = new Date();
    const dueAt = new Date(dto.dueAt);

    // R1 — validación fechas
    if (dueAt <= loanedAt) {
      throw new BadRequestException('dueAt debe ser posterior a la fecha actual');
    }
    const diffDays = (dueAt.getTime() - loanedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > maxLoanDays) {
      throw new BadRequestException(`El préstamo no puede exceder ${maxLoanDays} días`);
    }

    // R3 — límite préstamos usuario
    const activeCount = await this.loansRepo.count({
      where: { userId: dto.userId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (activeCount >= maxActiveLoans) {
      throw new ConflictException(`El usuario ya tiene ${maxActiveLoans} préstamos activos`);
    }

    // R2 — disponibilidad item
    const item = await this.itemsRepo.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) {
      throw new NotFoundException(`Ítem ${dto.itemId} no encontrado`);
    }
    const activeLoan = await this.loansRepo.findOne({
      where: { itemId: dto.itemId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (activeLoan) {
      throw new ConflictException('El ítem ya tiene un préstamo activo');
    }

    const loan = this.loansRepo.create({
      userId: dto.userId,
      itemId: dto.itemId,
      loanedAt,
      dueAt,
      returnedAt: null,
      status: LoanStatus.ACTIVE,
      fineAmount: null,
    });
    return this.loansRepo.save(loan);
  }

  async findAll(query: FindLoansDto, actor: AuthenticatedUser): Promise<PaginatedResult<Loan>> {
    const { page, limit, status, userId, itemId } = query as FindLoansDto & { itemId?: string };
    const isStaff = actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN;

    const qb = this.loansRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.item', 'item')
      .leftJoinAndSelect('l.user', 'user');

    if (!isStaff) {
      qb.where('l.userId = :uid', { uid: actor.id });
    } else if (userId) {
      qb.where('l.userId = :uid', { uid: userId });
    }

    if (itemId) {
      qb.andWhere('l.itemId = :itemId', { itemId });
    }

    if (status) {
      qb.andWhere('l.status = :status', { status });
    }

    qb.orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string, actor: AuthenticatedUser): Promise<Loan> {
    const loan = await this.loansRepo.findOne({
      where: { id },
      relations: ['item', 'user'],
    });
    if (!loan) {
      throw new NotFoundException(`Préstamo ${id} no encontrado`);
    }
    const isStaff = actor.role === UserRole.ADMIN || actor.role === UserRole.LIBRARIAN;
    if (!isStaff && loan.userId !== actor.id) {
      throw new ForbiddenException('No autorizado para ver este préstamo');
    }
    return loan;
  }

  async returnLoan(id: string): Promise<Loan> {
    const loan = await this.loansRepo.findOne({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Préstamo ${id} no encontrado`);
    }
    if (!RETURNABLE_STATUSES.includes(loan.status)) {
      throw new BadRequestException(`No se puede devolver un préstamo en estado "${loan.status}"`);
    }

    const returnedAt = new Date();
    loan.returnedAt = returnedAt;
    loan.status = LoanStatus.RETURNED;

    if (returnedAt > loan.dueAt) {
      const dailyFineRate = this.configService.get<number>('loans.dailyFineRate', 0.5);
      const daysOverdue = Math.ceil(
        (returnedAt.getTime() - loan.dueAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      loan.fineAmount = parseFloat((daysOverdue * dailyFineRate).toFixed(2));
    } else {
      loan.fineAmount = 0;
    }

    return this.loansRepo.save(loan);
  }

  async markLost(id: string): Promise<Loan> {
    const loan = await this.loansRepo.findOne({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Préstamo ${id} no encontrado`);
    }
    if (TERMINAL_STATUSES.includes(loan.status)) {
      throw new BadRequestException(`No se puede modificar un préstamo en estado "${loan.status}"`);
    }
    if (!RETURNABLE_STATUSES.includes(loan.status)) {
      throw new BadRequestException(`Transición inválida desde estado "${loan.status}"`);
    }
    loan.status = LoanStatus.LOST;
    return this.loansRepo.save(loan);
  }
}
