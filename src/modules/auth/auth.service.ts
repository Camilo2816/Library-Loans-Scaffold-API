import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return user;
  }

  async register(dto: RegisterDto, actorRole?: UserRole): Promise<AuthResponse> {
    const role = actorRole === UserRole.ADMIN && dto.role ? dto.role : UserRole.MEMBER;
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role,
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateUser(dto.email, dto.password);
    return this.buildAuthResponse(user);
  }

  async refresh(
    refreshToken: string,
    payload: { sub: string; email: string },
  ): Promise<AuthTokens> {
    const stored = await this.refreshTokenRepo.findOne({ where: { token: refreshToken } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new ForbiddenException('Refresh token inválido o revocado');
    }
    if (stored.userId !== payload.sub) {
      throw new ForbiddenException('Refresh token no corresponde al usuario');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user.isActive) {
      throw new ForbiddenException('Usuario inactivo');
    }
    return this.signTokens(user, false);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const stored = await this.refreshTokenRepo.findOne({ where: { token: refreshToken } });
    if (stored && stored.userId === userId && !stored.revokedAt) {
      stored.revokedAt = new Date();
      await this.refreshTokenRepo.save(stored);
    }
  }

  async getCurrentUser(userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.refreshTokenRepo.delete({ expiresAt: LessThan(new Date()) });
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const tokens = await this.signTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  private async signTokens(user: User, persist = true): Promise<AuthTokens> {
    const accessPayload = { sub: user.id, email: user.email, role: user.role };
    const refreshPayload = { sub: user.id, email: user.email, jti: uuidv4() };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
    });

    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn,
    });

    if (persist) {
      const expiresAt = this.computeExpiry(refreshExpiresIn);
      const entity = this.refreshTokenRepo.create({
        userId: user.id,
        token: refreshToken,
        expiresAt,
        revokedAt: null,
      });
      await this.refreshTokenRepo.save(entity);
    }

    return { accessToken, refreshToken };
  }

  private computeExpiry(span: string): Date {
    const match = /^(\d+)\s*([smhd])$/.exec(span.trim());
    const now = Date.now();
    if (!match) {
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(now + value * multipliers[unit]);
  }
}
