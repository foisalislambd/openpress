import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ContentService } from './content.service';
import {
  CreateContentDto,
  QueryContentDto,
  UpdateContentDto,
} from './content.dto';

@Controller('content')
export class ContentController {
  constructor(private content: ContentService) {}

  // ---- Public endpoints (no auth) ----
  @Get('public')
  publicList(@Query() query: QueryContentDto) {
    return this.content.findAll(query, true);
  }

  @Get('public/slug/:slug')
  publicBySlug(@Param('slug') slug: string) {
    return this.content.findBySlug(slug, true);
  }

  // ---- Admin endpoints ----
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryContentDto) {
    return this.content.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.content.findOne(id);
  }

  @Get(':id/revisions')
  @UseGuards(JwtAuthGuard)
  revisions(@Param('id') id: string) {
    return this.content.revisions(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateContentDto, @CurrentUser() user: JwtPayload) {
    return this.content.create(dto, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.content.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.content.remove(id, user);
  }
}
