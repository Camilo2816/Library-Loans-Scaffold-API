import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { Loan } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Item]), ReservationsModule],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
