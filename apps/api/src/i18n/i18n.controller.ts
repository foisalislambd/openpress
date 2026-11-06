import { Body, Controller, Delete, Get, Put, Query, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { I18nService } from './i18n.service';

class StringDto {
  @IsString()
  locale!: string;

  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  value!: string;
}

@Controller('i18n')
export class I18nController {
  constructor(private i18n: I18nService) {}

  @Get('public')
  publicCatalog(@Query('locale') locale?: string) {
    return this.i18n.catalog(locale);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  catalog(@Query('locale') locale?: string) {
    return this.i18n.catalog(locale);
  }

  @Put()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  upsert(@Body() dto: StringDto) {
    return this.i18n.upsert(dto.locale, dto.key, dto.value);
  }

  @Delete()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  remove(@Query('locale') locale: string, @Query('key') key: string) {
    return this.i18n.remove(locale, key);
  }
}
