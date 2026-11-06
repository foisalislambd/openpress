import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DbService } from '../db/db.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sid?: string;
  purpose?: string;
  scopes?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private db: DbService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'openpress-dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException();
    }
    if (payload.sid) {
      const session = await this.db.one<{ id: string }>(
        'SELECT id FROM user_sessions WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL',
        [payload.sid, payload.sub],
      );
      if (!session) throw new UnauthorizedException();
    }
    return payload;
  }
}
