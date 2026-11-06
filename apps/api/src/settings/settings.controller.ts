import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Allow, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { SettingsService } from './settings.service';

class OptionDto {
  @IsString()
  key!: string;

  @Allow()
  value!: unknown;
}

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  // Public: the frontend needs site title, active theme, etc.
  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Get('registry')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  registry() {
    return this.settings.definitions();
  }

  @Put('option')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  setOption(@Body() dto: OptionDto) {
    return this.settings.setRegistered(dto.key, dto.value);
  }

  @Get('theme-files')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_theme_options')
  themeFiles() {
    return this.settings.themeFiles();
  }

  @Put('theme-files')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_theme_options')
  saveThemeFile(@Body() body: { name?: string; source?: string }) {
    return this.settings.saveThemeFile(String(body.name ?? ''), String(body.source ?? ''));
  }

  @Put()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  update(@Body() values: Record<string, unknown>) {
    return this.settings.updateMany(values);
  }
}
