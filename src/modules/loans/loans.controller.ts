import {
  Body,
  Controller,
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
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FindLoansDto } from './dto/find-loans.dto';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLoanDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.create(dto, actor);
  }

  @Get()
  findAll(@Query() query: FindLoansDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.findAll(query, actor);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.findById(id, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Patch(':id/return')
  returnLoan(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.loansService.returnLoan(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LIBRARIAN)
  @Patch(':id/mark-lost')
  markLost(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.loansService.markLost(id);
  }
}
