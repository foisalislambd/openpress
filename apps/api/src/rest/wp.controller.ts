import { Controller, Get, Headers, Param, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { can } from '../auth/capabilities';
import { ApiKeyService } from '../auth/api-key.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { scopeAllows } from '../cms/publishing';
import { DbService } from '../db/db.service';
import { WpService } from './wp.service';

@Controller('wp/v2')
export class WpController {
  constructor(
    private wp: WpService,
    private jwt: JwtService,
    private keys: ApiKeyService,
    private db: DbService,
  ) {}

  @Get('posts')
  async posts(
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('_embed') embed?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const publicOnly = !(await this.trusted(authorization));
    return this.wp.posts({ page, per_page: perPage, search, status }, embed != null, publicOnly).then((result) => result.items);
  }

  @Get('posts/:id')
  post(@Param('id') id: string, @Query('_embed') embed?: string) {
    return this.wp.one(id, embed != null);
  }

  @Get('pages')
  pages(@Query('page') page?: string, @Query('per_page') perPage?: string, @Query('search') search?: string, @Query('_embed') embed?: string) {
    return this.wp.pages({ page, per_page: perPage, search }, embed != null);
  }

  @Get('pages/:id')
  page(@Param('id') id: string, @Query('_embed') embed?: string) {
    return this.wp.one(id, embed != null);
  }

  @Get('media')
  media(@Query('page') page?: string, @Query('per_page') perPage?: string) {
    return this.wp.media(page, perPage);
  }

  @Get('categories')
  categories() {
    return this.wp.categories();
  }

  @Get('tags')
  tags() {
    return this.wp.tags();
  }

  @Get('comments')
  comments(@Query('post') post?: string) {
    return this.wp.comments(post);
  }

  @Get('users')
  users() {
    return this.wp.users();
  }

  @Get()
  index(@Req() req: Request) {
    const host = `${req.protocol}://${req.get('host')}`;
    return {
      name: 'OpenPress',
      namespaces: ['wp/v2'],
      routes: {
        '/wp/v2/posts': `${host}/api/wp/v2/posts`,
        '/wp/v2/pages': `${host}/api/wp/v2/pages`,
        '/wp/v2/media': `${host}/api/wp/v2/media`,
        '/wp/v2/categories': `${host}/api/wp/v2/categories`,
        '/wp/v2/tags': `${host}/api/wp/v2/tags`,
        '/wp/v2/comments': `${host}/api/wp/v2/comments`,
        '/wp/v2/users': `${host}/api/wp/v2/users`,
      },
    };
  }

  private async trusted(authorization?: string) {
    if (!authorization?.toLowerCase().startsWith('bearer ')) return false;
    const token = authorization.slice(7).trim();
    if (token.startsWith('opk_')) {
      const user = await this.keys.authenticate(authorization);
      return Boolean(
        user && can(user.role, 'edit_posts') && scopeAllows(user.scopes, 'GET', '/api/content'),
      );
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      if (payload.purpose && payload.purpose !== 'access') return false;
      if (!can(payload.role, 'edit_posts')) return false;
      if (!payload.sid) return true;
      const session = await this.db.one<{ id: string }>(
        'SELECT id FROM user_sessions WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL',
        [payload.sid, payload.sub],
      );
      return Boolean(session);
    } catch {
      return false;
    }
  }
}
