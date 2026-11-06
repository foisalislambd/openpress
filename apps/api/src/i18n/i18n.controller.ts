import { Body, Controller, Delete, Get, Put, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
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

class MessageDto {
  @IsString()
  locale!: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  context?: string;

  @IsString()
  @MinLength(1)
  msgid!: string;

  @IsOptional()
  @IsString()
  msgidPlural?: string;

  @IsOptional()
  @IsString()
  msgstr?: string;

  @IsOptional()
  @IsString()
  msgstrPlural?: string;
}

@Controller('i18n')
export class I18nController {
  constructor(private i18n: I18nService) {}

  @Get('gettext')
  gettext(
    @Query('locale') locale = 'en',
    @Query('msgid') msgid = '',
    @Query('domain') domain?: string,
    @Query('context') context?: string,
    @Query('count') count?: string,
  ) {
    const parsed = count == null || count === '' ? undefined : Number(count);
    return this.i18n.translate({ locale, msgid, domain, context, count: Number.isFinite(parsed) ? parsed : undefined });
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  messages(@Query('locale') locale?: string) {
    return this.i18n.messages(locale);
  }

  @Put('messages')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  saveMessage(@Body() dto: MessageDto) {
    return this.i18n.saveMessage({
      locale: dto.locale,
      domain: dto.domain || 'openpress',
      context: dto.context || '',
      msgid: dto.msgid,
      msgidPlural: dto.msgidPlural || '',
      msgstr: dto.msgstr || '',
      msgstrPlural: dto.msgstrPlural || '',
    });
  }

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
