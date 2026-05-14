import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Item } from '../../items/entities/item.entity';

export enum LoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  OVERDUE = 'overdue',
}

@Entity({ name: 'loans' })
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Index()
  @Column({ type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item?: Item;

  @Column({ type: 'timestamptz' })
  loanDate!: Date;

  @Column({ type: 'timestamptz' })
  dueDate!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  returnDate!: Date | null;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.ACTIVE })
  status!: LoanStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  fineAmount!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
