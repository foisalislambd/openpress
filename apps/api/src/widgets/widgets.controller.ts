import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { WidgetsService } from './widgets.service';

class WidgetDto {
  @IsIn(['sidebar', 'footer'])
  area!: 'sidebar' | 'footer';

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

class WidgetPatchDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['sidebar', 'footer'])
  area?: 'sidebar' | 'footer';
}

@Controller('widgets')
export class WidgetsController {
  constructor(private widgets: WidgetsService) {}

  @Get('public')
  rendered() {
    return this.widgets.renderPublic();
  }

  @Get()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_theme_options')
  list() {
    return this.widgets.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_theme_options')
  create(@Body() dto: WidgetDto) {
    return this.widgets.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_theme_options')
  update(@Param('id') id: string, @Body() dto: WidgetPatchDto) {
    return this.widgets.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_theme_options')
  remove(@Param('id') id: string) {
    return this.widgets.remove(id);
  }
}
