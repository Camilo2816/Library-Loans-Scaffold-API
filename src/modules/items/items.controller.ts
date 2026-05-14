import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { FindItemsDto } from './dto/find-items.dto';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get()
  findAll(@Query() query: FindItemsDto) {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.itemsService.findById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.itemsService.remove(id);
  }
}
