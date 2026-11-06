import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { WebhooksService } from './webhooks.service';

class WebhookDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsArray()
  events?: string[];
}

@Controller('webhooks')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCaps('manage_options')
export class WebhooksController {
  constructor(private webhooks: WebhooksService) {}

  @Get()
  list() {
    return this.webhooks.list();
  }

  @Post()
  create(@Body() dto: WebhookDto) {
    return this.webhooks.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.webhooks.remove(id);
  }
}
