import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FindLoansDto } from './dto/find-loans.dto';
import { UserRole } from '../users/entities/user.entity';
import { AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { PaginatedResult } from '../users/users.service';

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
    const maxActiveLoans = this.configService.get<number>('loans.maxActivePerUser', 3);
    const maxLoanDays = this.configService.get<number>('loans.maxLoanDays', 30);

    const activeCount = await this.loansRepo.count({
      where: { userId: actor.id, status: LoanStatus.ACTIVE },
    });
    if (activeCount >= maxActiveLoans) {
      throw new BadRequestException(
        `No puede tener más de ${maxActiveLoans} préstamos activos simultáneamente`,
      );
    }

    const item = await this.itemsRepo.findOne({ where: { id: dto.itemId } });
    if (!item || !item.isActive) {
      throw new NotFoundException(`Ítem ${dto.itemId} no encontrado`);
    }
    if (item.availableCopies <= 0) {
      throw new BadRequestException('No hay copias disponibles de este ítem');
    }

    const loanDate = new Date();
    const dueDate = new Date(loanDate);
    dueDate.setDate(dueDate.getDate() + maxLoanDays);

    item.availableCopies -= 1;
    await this.itemsRepo.save(item);

    const loan = this.loansRepo.create({
      userId: actor.id,
      itemId: dto.itemId,
      loanDate,
      dueDate,
      returnDate: null,
      status: LoanStatus.ACTIVE,
      fineAmount: null,
    });
    return this.loansRepo.save(loan);
  }

  async findAll(query: FindLoansDto, actor: AuthenticatedUser): Promise<PaginatedResult<Loan>> {
    const { page, limit, status, userId } = query;
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
    const loan = await this.loansRepo.findOne({ where: { id }, relations: ['item'] });
    if (!loan) {
      throw new NotFoundException(`Préstamo ${id} no encontrado`);
    }
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException('El préstamo ya fue devuelto o está vencido');
    }

    const returnDate = new Date();
    loan.returnDate = returnDate;

    if (returnDate > loan.dueDate) {
      const dailyFineRate = this.configService.get<number>('loans.dailyFineRate', 0.5);
      const daysLate = Math.floor(
        (returnDate.getTime() - loan.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      loan.fineAmount = parseFloat((daysLate * dailyFineRate).toFixed(2));
      loan.status = LoanStatus.OVERDUE;
    } else {
      loan.fineAmount = null;
      loan.status = LoanStatus.RETURNED;
    }

    if (loan.item) {
      loan.item.availableCopies += 1;
      await this.itemsRepo.save(loan.item);
    }

    return this.loansRepo.save(loan);
  }
}
