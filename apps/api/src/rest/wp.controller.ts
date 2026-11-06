import { Controller, Get, Headers, Param, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { WpService } from './wp.service';

@Controller('wp/v2')
export class WpController {
  constructor(
    private wp: WpService,
    private jwt: JwtService,
  ) {}

  @Get('posts')
  posts(
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('_embed') embed?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const publicOnly = !this.trusted(authorization);
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
      },
    };
  }

  private trusted(authorization?: string) {
    if (!authorization?.toLowerCase().startsWith('bearer ')) return false;
    const token = authorization.slice(7).trim();
    if (token.startsWith('opk_')) return true;
    try {
      this.jwt.verify(token);
      return true;
    } catch {
      return false;
    }
  }
}
