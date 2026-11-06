import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CoreRegistry } from '../core/core-registry';
import { DbService } from '../db/db.service';
import { isUndefinedTable } from '../db/errors';
import { ROLE_CAPABILITIES, RoleName, capabilitiesFor, type Capability } from './capabilities';
import { hasAll, hasAny, resolveCapabilities } from './capability-resolve';

const ROLE_SLUG = /^[A-Z][A-Z0-9_]{1,40}$/;
const BUILTIN = new Set<string>(Object.keys(ROLE_CAPABILITIES));

@Injectable()
export class CapabilitiesService {
  constructor(
    private db: DbService,
    private registry: CoreRegistry,
  ) {}

  catalog() {
    const builtin = [...ROLE_CAPABILITIES.ADMIN];
    const registered = this.registry.capabilitiesFor();
    const names = new Set<string>([...builtin, ...registered.map((cap) => cap.name)]);
    return [...names].sort().map((name) => ({
      name,
      label: registered.find((cap) => cap.name === name)?.label ?? name.replaceAll('_', ' '),
      builtin: builtin.includes(name as Capability),
    }));
  }

  known(name: string) {
    return this.catalog().some((cap) => cap.name === name);
  }

  async list(userId: string) {
    const resolved = await this.resolve(userId);
    return resolved?.capabilities ?? [];
  }

  async allows(userId: string, capability: string) {
    return (await this.list(userId)).includes(capability);
  }

  async allowsAll(userId: string, capabilities: string[]) {
    return hasAll(await this.list(userId), capabilities);
  }

  async allowsAny(userId: string, capabilities: string[]) {
    return hasAny(await this.list(userId), capabilities);
  }

  async assert(userId: string, capability: string) {
    if (!(await this.allows(userId, capability))) {
      throw new ForbiddenException(`Missing capability: ${capability}`);
    }
  }

  async roles() {
    try {
      const rows = await this.db.query<{
        slug: string;
        label: string;
        capabilities: string[];
        builtin: boolean;
      }>('SELECT slug, label, capabilities, builtin FROM roles ORDER BY builtin DESC, slug ASC');
      if (rows.length) return rows;
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
    }
    return (Object.keys(ROLE_CAPABILITIES) as RoleName[]).map((slug) => ({
      slug,
      label: slug.charAt(0) + slug.slice(1).toLowerCase(),
      capabilities: [...ROLE_CAPABILITIES[slug]],
      builtin: true,
    }));
  }

  async createRole(label: string, slug: string, capabilities: string[]) {
    const name = slug.trim().toUpperCase();
    if (!ROLE_SLUG.test(name) || BUILTIN.has(name)) {
      throw new BadRequestException('Choose a new role slug using letters, numbers, and underscores');
    }
    const caps = this.cleanCaps(capabilities);
    const row = await this.db.one(
      `INSERT INTO roles (slug, label, capabilities, builtin)
       VALUES ($1, $2, $3::text[], false)
       RETURNING slug, label, capabilities, builtin`,
      [name, label.trim().slice(0, 80) || name, caps],
    );
    return row;
  }

  async updateRole(slug: string, input: { label?: string; capabilities?: string[] }) {
    const current = await this.db.one<{ slug: string; builtin: boolean; capabilities: string[] }>(
      'SELECT slug, builtin, capabilities FROM roles WHERE slug = $1',
      [slug],
    );
    if (!current) throw new NotFoundException('Role not found');
    let capabilities = input.capabilities ? this.cleanCaps(input.capabilities) : current.capabilities;
    if (slug === 'ADMIN') {
      const required = new Set(ROLE_CAPABILITIES.ADMIN);
      capabilities = [...new Set([...capabilities, ...required])];
    }
    const label = input.label?.trim().slice(0, 80);
    return this.db.one(
      `UPDATE roles
       SET label = COALESCE($2, label),
           capabilities = $3::text[],
           "updatedAt" = now()
       WHERE slug = $1
       RETURNING slug, label, capabilities, builtin`,
      [slug, label || null, capabilities],
    );
  }

  async deleteRole(slug: string) {
    if (BUILTIN.has(slug)) throw new BadRequestException('Built-in roles cannot be deleted');
    const used = await this.db.one<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE role = $1',
      [slug],
    );
    if ((used?.count ?? 0) > 0) throw new BadRequestException('Reassign users before deleting this role');
    const removed = await this.db.one('DELETE FROM roles WHERE slug = $1 AND builtin = false RETURNING slug', [slug]);
    if (!removed) throw new NotFoundException('Role not found');
    return removed;
  }

  async assertAssignable(actorId: string, role: string) {
    if (!ROLE_SLUG.test(role)) throw new BadRequestException('Invalid role');
    const known = await this.roles();
    if (!known.some((item) => item.slug === role)) throw new BadRequestException('Unknown role');
    if (role === 'ADMIN') {
      const actor = await this.db.one<{ role: string }>('SELECT role FROM users WHERE id = $1', [actorId]);
      if (actor?.role !== 'ADMIN') {
        throw new ForbiddenException('Only an administrator can assign the administrator role');
      }
    }
  }

  async userAccess(userId: string) {
    const rows = await this.safeExtras(userId);
    return {
      grants: rows.filter((row) => row.granted).map((row) => row.capability),
      denies: rows.filter((row) => !row.granted).map((row) => row.capability),
    };
  }

  async setUserAccess(userId: string, grants: string[], denies: string[]) {
    const user = await this.db.one('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundException('User not found');
    const grantSet = this.cleanCaps(grants);
    const denySet = this.cleanCaps(denies).filter((cap) => !grantSet.includes(cap));
    await this.db.tx(async (sql) => {
      await sql.query('DELETE FROM user_capabilities WHERE "userId" = $1', [userId]);
      for (const capability of grantSet) {
        await sql.query(
          'INSERT INTO user_capabilities ("userId", capability, granted) VALUES ($1, $2, true)',
          [userId, capability],
        );
      }
      for (const capability of denySet) {
        await sql.query(
          'INSERT INTO user_capabilities ("userId", capability, granted) VALUES ($1, $2, false)',
          [userId, capability],
        );
      }
    });
    return this.userAccess(userId);
  }

  private cleanCaps(values: string[]) {
    const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    const unknown = unique.filter((cap) => !this.known(cap));
    if (unknown.length) throw new BadRequestException(`Unknown capability: ${unknown[0]}`);
    return unique;
  }

  private async resolve(userId: string) {
    const user = await this.db.one<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (!user) return null;
    try {
      const role = await this.db.one<{ capabilities: string[] | null }>(
        'SELECT capabilities FROM roles WHERE slug = $1',
        [user.role],
      );
      const extras = await this.safeExtras(userId);
      const roleCapabilities = role?.capabilities?.length ? role.capabilities : capabilitiesFor(user.role);
      return {
        role: user.role,
        capabilities: resolveCapabilities({
          role: user.role,
          roleCapabilities,
          protectedCapabilities: user.role === 'ADMIN' ? ROLE_CAPABILITIES.ADMIN : [],
          grants: extras.filter((row) => row.granted).map((row) => row.capability),
          denies: extras.filter((row) => !row.granted).map((row) => row.capability),
        }),
      };
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
      return { role: user.role, capabilities: capabilitiesFor(user.role) };
    }
  }

  private async safeExtras(userId: string) {
    try {
      return await this.db.query<{ capability: string; granted: boolean }>(
        'SELECT capability, granted FROM user_capabilities WHERE "userId" = $1',
        [userId],
      );
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
      return [];
    }
  }
}

export type { Capability };
