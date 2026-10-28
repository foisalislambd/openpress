import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { isForeignKeyViolation, isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
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
  constructor(private db: DbService) {}

  async findAll() {
    const rows = await this.db.query<UserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM users u ORDER BY u."createdAt" ASC`,
    );
    return rows.map(presentUser);
  }

  async findOne(id: string) {
    const user = await this.db.one<UserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`,
      [id],
    );
    if (!user) throw new NotFoundException('User not found');
    return presentUser(user);
  }

  async create(dto: CreateUserDto) {
    try {
      const user = await this.db.one<UserRow>(
        `INSERT INTO users (id, email, name, role, "passwordHash", "updatedAt")
         VALUES ($1, $2, $3, $4::"Role", $5, now())
         RETURNING id, email, name, role, "avatarUrl", bio, "createdAt", 0 AS "contentCount"`,
        [
          newId(),
          dto.email,
          dto.name,
          dto.role ?? 'AUTHOR',
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

  async update(id: string, dto: UpdateUserDto) {
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;

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
      if (dto.role !== undefined) add('role', dto.role, '::"Role"');
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
}
