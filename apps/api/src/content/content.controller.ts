import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  BadRequestException,
  ForbiddenException,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CapabilitiesService } from '../auth/capabilities.service';
import { serializeBlocks, validateBlocks } from '../blocks/block-document';
import { JwtPayload } from '../auth/jwt.strategy';
import { ContentService } from './content.service';
import { IsString, Matches } from 'class-validator';
import { IsArray } from 'class-validator';
import {
  AutosaveDto,
  CreateContentDto,
  MetaDto,
  QueryContentDto,
  UnlockDto,
  UpdateContentDto,
} from './content.dto';

class TranslationDto {
  @IsString()
  @Matches(/^[a-z]{2}(-[a-z0-9]{2,8})?$/)
  locale!: string;
}

class BlocksDto {
  @IsArray()
  blocks!: unknown[];
}

@Controller('content')
export class ContentController {
  constructor(
    private content: ContentService,
    private caps: CapabilitiesService,
  ) {}

  @Get('public')
  publicList(@Query() query: QueryContentDto) {
    return this.content.findAll(query, true);
  }

  @Get('public/slug/:slug')
  publicBySlug(@Param('slug') slug: string, @Headers('x-openpress-unlock') unlock?: string) {
    return this.content.findBySlug(slug, true, unlock);
  }

  @Post('public/slug/:slug/unlock')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  unlock(@Param('slug') slug: string, @Body() dto: UnlockDto) {
    return this.content.unlock(slug, dto.password);
  }

  @Get('public/id/:id')
  publicById(@Param('id') id: string, @Headers('x-openpress-unlock') unlock?: string) {
    return this.content.findOne(id, true, unlock);
  }

  @Post('blocks/render')
  @UseGuards(JwtAuthGuard)
  async renderBlocks(@Body() dto: BlocksDto, @CurrentUser() user: JwtPayload) {
    await this.assertLibrary(user);
    const validated = validateBlocks(dto.blocks);
    if (!validated.ok) throw new BadRequestException(validated.errors[0] ?? 'Invalid blocks');
    return { blocks: validated.blocks, html: serializeBlocks(validated.blocks) };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryContentDto, @CurrentUser() user: JwtPayload) {
    await this.assertLibrary(user);
    return this.content.findAll(query);
  }

  @Get(':id/autosave')
  @UseGuards(JwtAuthGuard)
  async getAutosave(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertLibrary(user);
    return this.content.getAutosave(id, user);
  }

  @Put(':id/autosave')
  @UseGuards(JwtAuthGuard)
  autosave(@Param('id') id: string, @Body() dto: AutosaveDto, @CurrentUser() user: JwtPayload) {
    return this.content.autosave(id, dto, user);
  }

  @Get(':id/meta')
  @UseGuards(JwtAuthGuard)
  async meta(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertLibrary(user);
    return this.content.listMeta(id);
  }

  @Put(':id/meta')
  @UseGuards(JwtAuthGuard)
  upsertMeta(@Param('id') id: string, @Body() dto: MetaDto, @CurrentUser() user: JwtPayload) {
    return this.content.upsertMeta(id, dto.key, dto.value, user);
  }

  @Delete(':id/meta/:key')
  @UseGuards(JwtAuthGuard)
  deleteMeta(@Param('id') id: string, @Param('key') key: string, @CurrentUser() user: JwtPayload) {
    return this.content.deleteMeta(id, key, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertLibrary(user);
    return this.content.findOne(id);
  }

  @Get(':id/revisions')
  @UseGuards(JwtAuthGuard)
  async revisions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertLibrary(user);
    return this.content.revisions(id);
  }

  @Post(':id/revisions/:revisionId/restore')
  @UseGuards(JwtAuthGuard)
  restoreRevision(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.content.restoreRevision(id, revisionId, user);
  }

  @Post(':id/translations')
  @UseGuards(JwtAuthGuard)
  translate(@Param('id') id: string, @Body() dto: TranslationDto, @CurrentUser() user: JwtPayload) {
    return this.content.createTranslation(id, dto.locale, user);
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

  private async assertLibrary(user: JwtPayload) {
    const allowed = await this.caps.allowsAny(user.sub, ['edit_posts', 'edit_pages']);
    if (!allowed) throw new ForbiddenException('You cannot view the content library');
  }
}
