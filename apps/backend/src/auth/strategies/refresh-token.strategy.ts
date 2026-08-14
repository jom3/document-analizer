import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { requireEnv } from '../require-env.js';

const REFRESH_COOKIE = 'refresh_token';

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    super({
      jwtFromRequest: (req: Request) => req.cookies?.[REFRESH_COOKIE] ?? null,
      secretOrKey: requireEnv('JWT_REFRESH_SECRET'),
    });
  }

  validate(payload: RefreshTokenPayload): RefreshTokenPayload {
    return payload;
  }
}
