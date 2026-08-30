import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { UserRole } from '@distribuidor/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from './jwt-secret';

type AuthJwtPayload = {
  sub: string;
  username: string;
  role: UserRole;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  validate(payload: AuthJwtPayload) {
    return payload;
  }
}
