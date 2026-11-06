import { Body, Controller, Post } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { buildSchema, graphql } from 'graphql';
import { ContentService } from '../content/content.service';
import { currentSiteId } from '../sites/site-context';
import { DbService } from '../db/db.service';

class GraphqlDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

const schema = buildSchema(`
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
  type Query {
    posts(page: Int, perPage: Int, search: String): PostList!
    post(slug: String!): Post
    media(limit: Int): [MediaItem!]!
    categories: [Term!]!
    tags: [Term!]!
  }
`);

@Controller('graphql')
export class GraphqlController {
  constructor(
    private content: ContentService,
    private db: DbService,
  ) {}

  @Post()
  async query(@Body() body: GraphqlDto) {
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
          'SELECT id, filename, url, alt FROM media WHERE "siteId" = $2 ORDER BY "createdAt" DESC LIMIT $1',
          [limit, currentSiteId()],
        );
      },
      categories: () => this.db.query('SELECT id, name, slug FROM categories WHERE "siteId" = $1 ORDER BY name', [currentSiteId()]),
      tags: () => this.db.query('SELECT id, name, slug FROM tags WHERE "siteId" = $1 ORDER BY name', [currentSiteId()]),
    };
    return graphql({ schema, source: body.query ?? '', rootValue: root, variableValues: body.variables });
  }
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
