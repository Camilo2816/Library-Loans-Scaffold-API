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

export enum ReservationStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'reservations' })
@Index(['itemId', 'status'])
@Index(['userId', 'status'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item?: Item;

  @Column({ type: 'enum', enum: ReservationStatus, default: ReservationStatus.PENDING })
  status!: ReservationStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
