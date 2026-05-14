import { IsUUID } from 'class-validator';

export class CreateLoanDto {
  @IsUUID()
  itemId!: string;
}
