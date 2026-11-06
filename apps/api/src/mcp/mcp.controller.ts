import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ContentService } from '../content/content.service';
import { DbService } from '../db/db.service';

class RpcDto {
  @IsOptional()
  @IsString()
  jsonrpc?: string;

  @IsString()
  method!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  id?: string | number;
}

const TOOLS = [
  {
    name: 'content.search',
    description: 'Search posts and pages by title or excerpt.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' } } },
  },
  {
    name: 'content.draft',
    description: 'Create a draft post or page.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, excerpt: { type: 'string' }, type: { type: 'string' } },
      required: ['title'],
    },
  },
  {
    name: 'content.schedule',
    description: 'Schedule an existing post.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, scheduledAt: { type: 'string' } },
      required: ['id', 'scheduledAt'],
    },
  },
  {
    name: 'media.search',
    description: 'List recent media, optionally filtered by filename.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
];

@Controller('mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
  constructor(
    private content: ContentService,
    private db: DbService,
  ) {}

  @Post()
  async rpc(@Body() dto: RpcDto, @CurrentUser() user: JwtPayload) {
    const id = dto.id ?? null;
    try {
      const result = await this.call(dto.method, dto.params ?? {}, user);
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: error instanceof Error ? error.message : 'Tool failed' },
      };
    }
  }

  private async call(method: string, params: Record<string, unknown>, user: JwtPayload) {
    if (method === 'initialize' || method === 'tools/list') {
      return { protocolVersion: '2025-06-18', serverInfo: { name: 'openpress', version: '0.3.0' }, tools: TOOLS };
    }
    if (method !== 'tools/call') {
      throw new Error(`Unknown method ${method}`);
    }
    const name = String(params.name ?? '');
    const args = (params.arguments ?? params.args ?? {}) as Record<string, unknown>;
    if (name === 'content.search') {
      const found = await this.content.findAll({
        search: String(args.query ?? ''),
        type: args.type === 'PAGE' ? 'PAGE' : 'POST',
        perPage: '10',
      });
      return { content: found.items.map((item) => ({ id: item.id, title: item.title, slug: item.slug, status: item.status })) };
    }
    if (name === 'content.draft') {
      const created = await this.content.create(
        { title: String(args.title ?? 'Untitled'), excerpt: String(args.excerpt ?? ''), type: args.type === 'PAGE' ? 'PAGE' : 'POST', status: 'DRAFT' },
        user,
      );
      return { content: { id: created.id, slug: created.slug, status: created.status } };
    }
    if (name === 'content.schedule') {
      const updated = await this.content.update(
        String(args.id),
        { status: 'SCHEDULED', scheduledAt: String(args.scheduledAt) } as never,
        user,
      );
      return { content: { id: updated.id, status: updated.status, scheduledAt: updated.scheduledAt } };
    }
    if (name === 'media.search') {
      const query = String(args.query ?? '').trim();
      const rows = await this.db.query(
        `SELECT id, filename, url, alt, "mimeType"
         FROM media
         WHERE ($1 = '' OR filename ILIKE $2 OR COALESCE(alt, '') ILIKE $2)
         ORDER BY "createdAt" DESC
         LIMIT 20`,
        [query, `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`],
      );
      return { content: rows };
    }
    throw new Error(`Unknown tool ${name}`);
  }
}
