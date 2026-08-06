import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { UserRole } from '@distribuidor/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';

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
      secretOrKey: process.env.JWT_SECRET ?? 'dev_secret_change_me',
    });
  }

  validate(payload: AuthJwtPayload) {
    return payload;
  }
}
