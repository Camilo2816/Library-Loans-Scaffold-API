import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ description: 'UUID del usuario que recibe el préstamo' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'UUID del item a prestar' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ description: 'Fecha de vencimiento (ISO 8601)', example: '2026-06-15T00:00:00.000Z' })
  @IsDateString()
  dueAt!: string;
}
