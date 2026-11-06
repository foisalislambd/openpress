import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { currentSiteId } from '../sites/site-context';
import { validateBlocks } from './block-document';
import { BadRequestException, NotFoundException } from '@nestjs/common';

class ReusableDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsArray()
  blocks!: unknown[];
}

@Controller('blocks/reusable')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCaps('edit_posts')
export class ReusableBlocksController {
  constructor(private db: DbService) {}

  @Get()
  list() {
    return this.db.query(
      'SELECT id, title, blocks, "updatedAt" FROM reusable_blocks WHERE "siteId" = $1 ORDER BY title',
      [currentSiteId()],
    );
  }

  @Post()
  async create(@Body() dto: ReusableDto) {
    const validated = validateBlocks(dto.blocks);
    if (!validated.ok) throw new BadRequestException(validated.errors[0] ?? 'Invalid blocks');
    const id = newId();
    await this.db.query(
      `INSERT INTO reusable_blocks (id, "siteId", title, blocks) VALUES ($1, $2, $3, $4::jsonb)`,
      [id, currentSiteId(), dto.title.trim().slice(0, 120), JSON.stringify(validated.blocks)],
    );
    return { id, title: dto.title.trim(), blocks: validated.blocks };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const removed = await this.db.one('DELETE FROM reusable_blocks WHERE id = $1 AND "siteId" = $2 RETURNING id', [
      id,
      currentSiteId(),
    ]);
    if (!removed) throw new NotFoundException('Reusable block not found');
    return removed;
  }
}
