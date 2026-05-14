import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

interface RefreshPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshPayload): RefreshPayload & { refreshToken: string } {
    const refreshToken = (req.body as { refreshToken?: string }).refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }
    return { ...payload, refreshToken };
  }
}
