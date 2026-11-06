import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { isForeignKeyViolation, isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { ROLE_CAPABILITIES } from '../auth/capabilities';
import { CapabilitiesService } from '../auth/capabilities.service';

const ROLE_CAP_SQL = ROLE_CAPABILITIES.ADMIN.map((cap) => `'${cap}'`).join(', ');
import { CreateUserDto, UpdateUserDto } from './users.dto';

const PUBLIC_COLUMNS = `u.id, u.email, u.name, u.role, u."avatarUrl", u.bio, u."createdAt",
  (SELECT count(*)::int FROM contents c WHERE c."authorId" = u.id) AS "contentCount"`;

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
  contentCount: number;
};

function presentUser(row: UserRow) {
  const { contentCount, ...user } = row;
  return { ...user, _count: { contents: contentCount } };
}

@Injectable()
export class UsersService {
  constructor(
    private db: DbService,
    private caps: CapabilitiesService,
  ) {}

  async findAll(filter: { role?: string; search?: string; capability?: string } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace('$?', `$${params.length}`));
    };
    if (filter.role) add('u.role = $?', filter.role);
    if (filter.search?.trim()) {
      const like = `%${filter.search.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      params.push(like);
      const left = params.length;
      params.push(like);
      clauses.push(`(u.name ILIKE $${left} ESCAPE '\\' OR u.email ILIKE $${params.length} ESCAPE '\\')`);
    }
    if (filter.capability && this.caps.known(filter.capability)) {
      params.push(filter.capability);
      const cap = `$${params.length}`;
      clauses.push(`(
        (u.role = 'ADMIN' AND ${cap} = ANY(ARRAY[${ROLE_CAP_SQL}]))
        OR EXISTS (SELECT 1 FROM roles r WHERE r.slug = u.role AND ${cap} = ANY(r.capabilities))
        OR EXISTS (SELECT 1 FROM user_capabilities g WHERE g."userId" = u.id AND g.capability = ${cap} AND g.granted = true)
      ) AND NOT EXISTS (
        SELECT 1 FROM user_capabilities d
        WHERE d."userId" = u.id AND d.capability = ${cap} AND d.granted = false AND u.role <> 'ADMIN'
      )`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.db.query<UserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM users u ${where} ORDER BY u."createdAt" ASC`,
      params,
    );
    return rows.map(presentUser);
  }

  async findOne(id: string) {
    const user = await this.db.one<UserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`,
      [id],
    );
    if (!user) throw new NotFoundException('User not found');
    return { ...presentUser(user), access: await this.caps.userAccess(id) };
  }

  async create(dto: CreateUserDto, actorId: string) {
    const role = dto.role ?? 'AUTHOR';
    await this.caps.assertAssignable(actorId, role);
    try {
      const user = await this.db.one<UserRow>(
        `INSERT INTO users (id, email, name, role, "passwordHash", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING id, email, name, role, "avatarUrl", bio, "createdAt", 0 AS "contentCount"`,
        [
          newId(),
          dto.email,
          dto.name,
          role,
          await bcrypt.hash(dto.password, 10),
        ],
      );
      if (!user) throw new ConflictException('Email already registered');
      return presentUser(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email already registered');
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;

    if (dto.role) await this.caps.assertAssignable(actorId, dto.role);
    await this.db.tx(async (sql) => {
      // Lock every admin so two requests cannot demote the last two admins together.
      if (dto.role && dto.role !== 'ADMIN') {
        await sql.query(`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`);
        const target = await sql.one<{ role: string }>(
          'SELECT role FROM users WHERE id = $1',
          [id],
        );
        if (target?.role === 'ADMIN') {
          const admins = await sql.one<{ count: number }>(
            `SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN'`,
          );
          if ((admins?.count ?? 0) <= 1) {
            throw new BadRequestException(
              'Cannot demote the last administrator',
            );
          }
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (column: string, value: unknown, cast = '') => {
        params.push(value);
        sets.push(`${column} = $${params.length}${cast}`);
      };
      if (dto.name !== undefined) add('name', dto.name);
      if (dto.role !== undefined) add('role', dto.role);
      if (dto.bio !== undefined) add('bio', dto.bio);
      if (dto.avatarUrl !== undefined) add('"avatarUrl"', dto.avatarUrl);
      if (passwordHash) add('"passwordHash"', passwordHash);
      sets.push('"updatedAt" = now()');
      params.push(id);

      const updated = await sql.one<{ id: string }>(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
        params,
      );
      if (!updated) throw new NotFoundException('User not found');
    });
    return this.findOne(id);
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    try {
      return await this.db.tx(async (sql) => {
        await sql.query(`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`);
        const target = await sql.one<{
          role: string;
          contents: number;
          media: number;
        }>(
          `SELECT u.role,
                  (SELECT count(*)::int FROM contents c WHERE c."authorId" = u.id) AS contents,
                  (SELECT count(*)::int FROM media m WHERE m."uploaderId" = u.id) AS media
           FROM users u
           WHERE u.id = $1
           FOR UPDATE`,
          [id],
        );
        if (!target) throw new NotFoundException('User not found');
        if (target.role === 'ADMIN') {
          const admins = await sql.one<{ count: number }>(
            `SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN'`,
          );
          if ((admins?.count ?? 0) <= 1) {
            throw new BadRequestException('Cannot delete the last administrator');
          }
        }
        if (target.contents > 0 || target.media > 0) {
          throw new BadRequestException(
            'This user still owns content or media. Reassign or delete it first.',
          );
        }
        const removed = await sql.one<{ id: string }>(
          'DELETE FROM users WHERE id = $1 RETURNING id',
          [id],
        );
        if (!removed) throw new NotFoundException('User not found');
        return removed;
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          'This user still owns content, media, or revisions. Reassign or delete them first.',
        );
      }
      throw error;
    }
  }

  async listMeta(userId: string, actorId: string) {
    await this.assertMetaRead(userId, actorId);
    const staff = await this.caps.allows(actorId, 'edit_users');
    const rows = await this.db.query<{ id: string; key: string; value: unknown }>(
      `SELECT id, "metaKey" AS key, "metaValue" AS value FROM user_meta WHERE "userId" = $1 ORDER BY "metaKey"`,
      [userId],
    );
    return staff ? rows : rows.filter((row) => !row.key.startsWith('_'));
  }

  async upsertMeta(userId: string, actorId: string, key: string, value: unknown) {
    await this.assertMetaWrite(userId, actorId, key);
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) {
      throw new BadRequestException('Meta keys must start with a letter');
    }
    const encoded = JSON.stringify(value ?? null);
    if (encoded.length > 20_000) throw new BadRequestException('Meta value is too large');
    await this.db.query(
      `INSERT INTO user_meta (id, "userId", "metaKey", "metaValue")
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT ("userId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
      [newId(), userId, key, encoded],
    );
    return { key, value };
  }

  async deleteMeta(userId: string, actorId: string, key: string) {
    await this.assertMetaWrite(userId, actorId, key);
    await this.db.query('DELETE FROM user_meta WHERE "userId" = $1 AND "metaKey" = $2', [userId, key]);
    return { key };
  }

  private async assertMetaRead(userId: string, actorId: string) {
    if (userId === actorId) return;
    if (!(await this.caps.allows(actorId, 'list_users')) && !(await this.caps.allows(actorId, 'edit_users'))) {
      throw new ForbiddenException('You cannot read this profile');
    }
  }

  private async assertMetaWrite(userId: string, actorId: string, key: string) {
    const staff = await this.caps.allows(actorId, 'edit_users');
    if (key.startsWith('_') && !staff) throw new ForbiddenException('Private profile fields are staff-only');
    if (userId !== actorId && !staff) throw new ForbiddenException('You cannot edit this profile');
    const exists = await this.db.one('SELECT id FROM users WHERE id = $1', [userId]);
    if (!exists) throw new NotFoundException('User not found');
  }
}
