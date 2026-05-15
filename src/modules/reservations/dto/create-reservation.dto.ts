import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ description: 'UUID del item a reservar' })
  @IsUUID()
  itemId!: string;
}
