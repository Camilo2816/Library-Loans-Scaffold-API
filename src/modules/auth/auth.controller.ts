import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '@common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshTokenDto })
  refresh(@Body() dto: RefreshTokenDto, @CurrentUser() payload: { sub: string; email: string }) {
    return this.authService.refresh(dto.refreshToken, { sub: payload.sub, email: payload.email });
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto, @CurrentUser() actor: AuthenticatedUser) {
    await this.authService.logout(actor.id, dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() actor: AuthenticatedUser) {
    return this.authService.getCurrentUser(actor.id);
  }
}
