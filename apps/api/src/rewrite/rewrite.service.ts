import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CoreRegistry } from '../core/core-registry';
import { DbService } from '../db/db.service';
import { isUndefinedTable } from '../db/errors';
import { newId } from '../db/ids';
import { SettingsService } from '../settings/settings.service';
import { compileRewrite, findConflicts, matchRewrite, RewriteRule, ruleTouchesReserved, structureRule } from './rewrite-rules';

@Injectable()
export class RewriteService {
  constructor(
    private db: DbService,
    private settings: SettingsService,
    private registry: CoreRegistry,
  ) {}

  async rules() {
    const custom = await this.custom();
    const core = await this.coreRule();
    return [...(core ? [core] : []), ...this.registry.rewritesFor(), ...custom];
  }

  async conflicts() {
    return findConflicts(await this.rules());
  }

  async match(path: string) {
    const rules = (await this.rules()).filter((rule) => rule.source !== 'core');
    return matchRewrite(path, rules) ?? { id: null, query: {}, rewriteTo: null };
  }

  async create(input: { pattern: string; query: Record<string, string>; priority?: number }) {
    const pattern = input.pattern.trim();
    if (!compileRewrite(pattern) || ruleTouchesReserved(pattern)) {
      throw new BadRequestException('Rewrite pattern must be an anchored regular expression and must not match admin or API paths');
    }
    const query = cleanQuery(input.query);
    if (!query.rewriteTo) throw new BadRequestException('query.rewriteTo must be an internal path');
    const rule: RewriteRule = {
      id: newId(),
      pattern,
      query,
      source: 'custom',
      priority: Number.isFinite(input.priority) ? Math.floor(input.priority!) : 10,
    };
    const conflicts = findConflicts([...(await this.rules()), rule]);
    const own = conflicts.filter((conflict) => conflict.rules.includes(rule.id));
    if (own.length) throw new ConflictException({ message: 'Rewrite rule conflicts with an existing rule', conflicts: own });
    await this.db.query(
      `INSERT INTO rewrite_rules (id, pattern, query, source, priority) VALUES ($1, $2, $3::jsonb, 'custom', $4)`,
      [rule.id, rule.pattern, JSON.stringify(rule.query), rule.priority],
    );
    return rule;
  }

  async remove(id: string) {
    const removed = await this.db.one(
      `DELETE FROM rewrite_rules WHERE id = $1 AND source = 'custom' RETURNING id`,
      [id],
    );
    if (!removed) throw new NotFoundException('Rewrite rule not found');
    return removed;
  }

  private async coreRule(): Promise<RewriteRule | null> {
    const settings = await this.settings.getAll();
    return structureRule(String(settings.permalinkStructure ?? ''));
  }

  private async custom(): Promise<RewriteRule[]> {
    try {
      const rows = await this.db.query<{ id: string; pattern: string; query: Record<string, string>; source: string; priority: number }>(
        'SELECT id, pattern, query, source, priority FROM rewrite_rules ORDER BY priority ASC',
      );
      return rows;
    } catch (error) {
      if (isUndefinedTable(error)) return [];
      throw error;
    }
  }
}

function cleanQuery(query: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    if (typeof value !== 'string' || value.length > 300) continue;
    next[key] = value;
  }
  if (next.rewriteTo && (!next.rewriteTo.startsWith('/') || next.rewriteTo.startsWith('//') || next.rewriteTo.includes('..'))) {
    delete next.rewriteTo;
  }
  return next;
}
