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

  async login(dto: LoginDto) {
    const user = await this.db.one<AuthUser>(
      'SELECT id, email, role, "passwordHash" FROM users WHERE email = $1',
      [dto.email],
    );
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.refreshSecret,
      });
      const user = await this.db.one<AuthUser>(
        'SELECT id, email, role FROM users WHERE id = $1',
        [payload.sub],
      );
      if (!user) throw new UnauthorizedException();
      return this.issueTokens(user.id, user.email, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
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

  private issueTokens(sub: string, email: string, role: string) {
    const payload = { sub, email, role };
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
