import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { AuditService } from '../platform/audit.service';
import { LoginDto, RegisterDto } from './auth.dto';

const PUBLIC_USER = `id, email, name, role, "avatarUrl", bio, "createdAt"`;

type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
};

type AuthUser = PublicUser & { passwordHash: string };

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;

  constructor(
    private db: DbService,
    private jwt: JwtService,
    private audit: AuditService,
    config: ConfigService,
  ) {
    this.refreshSecret =
      config.get<string>('JWT_REFRESH_SECRET') ?? 'openpress-dev-refresh';
  }

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    let user: AuthUser | null;
    try {
      user = await this.db.tx(async (sql) => {
        // One registration at a time, so two first signups cannot both become admin.
        await sql.query('SELECT pg_advisory_xact_lock($1::bigint)', [84215045]);
        const counted = await sql.one<{ count: number }>(
          'SELECT count(*)::int AS count FROM users',
        );
        const userCount = counted?.count ?? 0;

        // After the first (admin) account, public registration must be
        // explicitly enabled in settings.
        if (userCount > 0) {
          const setting = await sql.one<{ value: unknown }>(
            'SELECT value FROM settings WHERE key = $1',
            ['allowRegistration'],
          );
          if (setting?.value !== true) {
            throw new ForbiddenException(
              'Registration is disabled. Ask an administrator to create your account.',
            );
          }
        }

        const existing = await sql.one<{ id: string }>(
          'SELECT id FROM users WHERE email = $1',
          [dto.email],
        );
        if (existing) throw new ConflictException('Email already registered');

        return sql.one<AuthUser>(
          `INSERT INTO users (id, email, name, "passwordHash", role, "updatedAt")
           VALUES ($1, $2, $3, $4, $5::"Role", now())
           RETURNING id, email, role`,
          [
            newId(),
            dto.email,
            dto.name,
            passwordHash,
            userCount === 0 ? 'ADMIN' : 'AUTHOR',
          ],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
    if (!user) throw new ConflictException('Email already registered');
    return this.issueTokens(user.id, user.email, user.role);
  }

  async login(dto: LoginDto, meta?: SessionMeta) {
    const user = await this.db.one<AuthUser>(
      'SELECT id, email, role, "passwordHash" FROM users WHERE email = $1',
      [dto.email],
    );
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      await this.audit.record('auth.login_failed', { email: dto.email });
      throw new UnauthorizedException('Invalid credentials');
    }
    const totp = await this.db.one<{ enabled: boolean }>(
      'SELECT enabled FROM user_totp WHERE "userId" = $1',
      [user.id],
    );
    if (totp?.enabled) {
      const ticket = this.jwt.sign(
        { sub: user.id, email: user.email, role: user.role, purpose: 'mfa' },
        { expiresIn: '5m' },
      );
      return { mfaRequired: true as const, ticket };
    }
    await this.audit.record('auth.login', { email: user.email }, user.id);
    return this.issueTokens(user.id, user.email, user.role, meta);
  }

  async confirmMfa(ticket: string, code: string, verify: (userId: string, code: string) => Promise<boolean>, meta?: SessionMeta) {
    let payload: { sub: string; email: string; role: string; purpose?: string };
    try {
      payload = this.jwt.verify(ticket);
    } catch {
      throw new UnauthorizedException('Sign-in expired. Enter your password again.');
    }
    if (payload.purpose !== 'mfa') throw new UnauthorizedException('Sign-in expired. Enter your password again.');
    if (!(await verify(payload.sub, code))) throw new UnauthorizedException('That code did not match');
    await this.audit.record('auth.login', { email: payload.email, mfa: true }, payload.sub);
    return this.issueTokens(payload.sub, payload.email, payload.role, meta);
  }

  async refresh(refreshToken: string, meta?: SessionMeta) {
    try {
      const payload = this.jwt.verify<{ sub: string; sid?: string }>(refreshToken, {
        secret: this.refreshSecret,
      });
      const user = await this.db.one<AuthUser>(
        'SELECT id, email, role FROM users WHERE id = $1',
        [payload.sub],
      );
      if (!user) throw new UnauthorizedException();
      if (payload.sid) {
        const session = await this.db.one<{ id: string }>(
          'SELECT id FROM user_sessions WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL',
          [payload.sid, user.id],
        );
        if (!session) throw new UnauthorizedException();
      }
      return this.issueTokens(user.id, user.email, user.role, meta, payload.sid);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async linkExternalUser(provider: string, profile: { id: string; email: string; name: string }) {
    const linked = await this.db.one<{ userId: string }>(
      'SELECT "userId" FROM oauth_identities WHERE provider = $1 AND "providerUserId" = $2',
      [provider, profile.id],
    );
    if (linked) {
      const user = await this.db.one<AuthUser>('SELECT id, email, role FROM users WHERE id = $1', [linked.userId]);
      if (!user) throw new UnauthorizedException();
      return user;
    }
    let user = await this.db.one<AuthUser>('SELECT id, email, role FROM users WHERE email = $1', [profile.email]);
    if (!user) {
      const passwordHash = await bcrypt.hash(newId(), 10);
      user = await this.db.one<AuthUser>(
        `INSERT INTO users (id, email, name, "passwordHash", role, "updatedAt")
         VALUES ($1, $2, $3, $4, 'AUTHOR', now())
         RETURNING id, email, role`,
        [newId(), profile.email, profile.name.slice(0, 80), passwordHash],
      );
    }
    if (!user) throw new UnauthorizedException();
    await this.db.query(
      `INSERT INTO oauth_identities (id, "userId", provider, "providerUserId", email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, "providerUserId") DO NOTHING`,
      [newId(), user.id, provider, profile.id, profile.email],
    );
    await this.audit.record('auth.oauth', { provider, email: user.email }, user.id);
    return user;
  }

  async updateProfile(
    userId: string,
    input: { name?: string; bio?: string; password?: string },
  ) {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.name) add('name', input.name);
    if (input.bio !== undefined) add('bio', input.bio);
    if (input.password) add('"passwordHash"', await bcrypt.hash(input.password, 10));
    sets.push('"updatedAt" = now()');
    params.push(userId);
    const user = await this.db.one<PublicUser>(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING ${PUBLIC_USER}`,
      params,
    );
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async me(userId: string) {
    const user = await this.db.one<PublicUser>(
      `SELECT ${PUBLIC_USER} FROM users WHERE id = $1`,
      [userId],
    );
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async issueTokens(sub: string, email: string, role: string, meta?: SessionMeta, existingSid?: string) {
    let sid = existingSid;
    if (sid) {
      const session = await this.db.one<{ id: string }>(
        'SELECT id FROM user_sessions WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL',
        [sid, sub],
      );
      if (!session) sid = undefined;
      else {
        await this.db.query('UPDATE user_sessions SET "lastSeenAt" = now() WHERE id = $1', [sid]);
      }
    }
    if (!sid) {
      sid = newId();
      await this.db.query(
        `INSERT INTO user_sessions (id, "userId", "userAgent", ip) VALUES ($1, $2, $3, $4)`,
        [sid, sub, meta?.userAgent?.slice(0, 300) ?? null, meta?.ip?.slice(0, 64) ?? null],
      );
    }
    const payload = { sub, email, role, sid, purpose: 'access' };
    return {
      accessToken: this.jwt.sign(payload),
      refreshToken: this.jwt.sign(payload, {
        secret: this.refreshSecret,
        expiresIn: '7d',
      }),
      user: { id: sub, email, role },
    };
  }
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}
