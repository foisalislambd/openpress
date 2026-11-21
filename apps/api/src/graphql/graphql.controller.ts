import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { buildSchema, graphql, GraphQLSchema } from 'graphql';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ContentService } from '../content/content.service';
import { PUBLISHED_MEDIA_MATCH } from '../content/public-media';
import { currentSiteId } from '../sites/site-context';
import { DbService } from '../db/db.service';
import { HooksService } from '../hooks/hooks.service';
import { ExtensionRegistry } from '../extensions/extension-registry';
import { clampGraphqlValue, compilePluginGraphql } from '../extensions/plugin-graphql';
import { ACCESS_COOKIE, readCookie } from '../auth/session-cookie';

class GraphqlDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

const CORE_TYPES = `
  type Post {
    id: ID!
    title: String!
    slug: String!
    excerpt: String
    status: String!
    link: String
    type: String!
  }
  type PostList {
    items: [Post!]!
    total: Int!
  }
  type MediaItem {
    id: ID!
    filename: String!
    url: String!
    alt: String
  }
  type Term {
    id: ID!
    name: String!
    slug: String!
  }
  type Comment {
    id: ID!
    body: String!
    parentId: String
    authorName: String
  }
`;

const CORE_QUERY = `
  posts(page: Int, perPage: Int, search: String): PostList!
  post(slug: String!): Post
  media(limit: Int): [MediaItem!]!
  categories: [Term!]!
  tags: [Term!]!
  comments(contentId: String!): [Comment!]!
`;

@Controller('graphql')
export class GraphqlController {
  constructor(
    private content: ContentService,
    private db: DbService,
    private hooks: HooksService,
    private registry: ExtensionRegistry,
    private jwt: JwtService,
  ) {}

  @Post()
  async query(@Body() body: GraphqlDto, @Req() req: Request) {
    if (!body.query || body.query.length > 12_000 || braceDepth(body.query) > 8) {
      throw new BadRequestException('Query is empty or too expensive');
    }
    const root = {
      posts: async (args: { page?: number; perPage?: number; search?: string }) => {
        const result = await this.content.findAll(
          {
            type: 'POST',
            postType: 'post',
            page: String(args.page ?? 1),
            perPage: String(args.perPage ?? 10),
            search: args.search,
          },
          true,
        );
        return {
          total: result.total,
          items: result.items.map(mapPost),
        };
      },
      post: async (args: { slug: string }) => {
        const content = await this.content.findBySlug(args.slug, true).catch(() => null);
        return content ? mapPost(content) : null;
      },
      media: async (args: { limit?: number }) => {
        const limit = Math.min(50, Math.max(1, args.limit ?? 12));
        return this.db.query(
          `SELECT m.id, m.filename, m.url, m.alt
           FROM media m
           WHERE m."siteId" = $2 AND ${PUBLISHED_MEDIA_MATCH}
           ORDER BY m."createdAt" DESC
           LIMIT $1`,
          [limit, currentSiteId()],
        );
      },
      categories: () => this.db.query('SELECT id, name, slug FROM categories WHERE "siteId" = $1 ORDER BY name', [currentSiteId()]),
      tags: () => this.db.query('SELECT id, name, slug FROM tags WHERE "siteId" = $1 ORDER BY name', [currentSiteId()]),
      comments: (args: { contentId: string }) =>
        this.db.query(
          `SELECT c.id, c.body, c."parentId" AS "parentId", COALESCE(u.name, c."guestName") AS "authorName"
           FROM comments c
           LEFT JOIN users u ON u.id = c."authorId"
           JOIN contents content ON content.id = c."contentId"
           WHERE c."contentId" = $1 AND c.status = 'APPROVED' AND content."siteId" = $2
           ORDER BY c."createdAt" ASC`,
          [args.contentId, currentSiteId()],
        ),
    };
    const user = await this.sessionUser(req);
    const extensions = this.registry.graphqlExtensions();
    const compiled = compilePluginGraphql(extensions.types, extensions.fields);
    const built = this.schemaFor(compiled);
    for (const field of compiled.fields) {
      const resolver = extensions.fields.find((item) => item.role === field.role && item.name === field.name);
      if (!resolver) continue;
      root[field.name] = async (args: Record<string, unknown>) => {
        if (field.role === 'mutation' && !user) throw new Error('Sign in required');
        return clampGraphqlValue(await resolver.resolve(args ?? {}));
      };
    }
    const result = await graphql({ schema: built, source: body.query ?? '', rootValue: root, variableValues: body.variables });
    return this.hooks.applyFilters('graphql_response', result);
  }

  private schemaFor(compiled: ReturnType<typeof compilePluginGraphql>): GraphQLSchema {
    const mutations = compiled.mutations.length ? `type Mutation { ${compiled.mutations.join('\n')} }` : '';
    const source = `${schemaSource()}\n${compiled.types}\ntype Query { ${CORE_QUERY}\n${compiled.queries.join('\n')} }\n${mutations}`;
    try {
      return buildSchema(source);
    } catch {
      return buildSchema(`${schemaSource()}\ntype Query { ${CORE_QUERY} }`);
    }
  }

  private async sessionUser(req: Request) {
    const header = req.header('authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = bearer || readCookie(req, ACCESS_COOKIE);
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync(token);
    } catch {
      return null;
    }
  }
}

function schemaSource() {
  return CORE_TYPES;
}

function braceDepth(source: string) {
  let depth = 0;
  let max = 0;
  for (const char of source) {
    if (char === '{') {
      depth += 1;
      if (depth > max) max = depth;
    } else if (char === '}') depth = Math.max(0, depth - 1);
  }
  return max;
}

function mapPost(item: { id: string; title: string; slug: string; excerpt?: string | null; status: string; permalink?: string; type: string }) {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    status: item.status,
    link: item.permalink ?? `/${item.slug}`,
    type: item.type,
  };
}
