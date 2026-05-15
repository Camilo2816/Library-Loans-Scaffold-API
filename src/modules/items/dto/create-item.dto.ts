import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ItemType } from '../entities/item.entity';

export class CreateItemDto {
  @ApiProperty({ example: 'LIB-001' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Clean Code' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ enum: ItemType })
  @IsEnum(ItemType)
  type!: ItemType;
}
