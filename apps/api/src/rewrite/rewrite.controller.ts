import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { RewriteService } from './rewrite.service';

class RuleDto {
  @IsString()
  @MinLength(2)
  pattern!: string;

  @IsObject()
  query!: Record<string, string>;

  @IsOptional()
  priority?: number;
}

@Controller('rewrite')
export class RewriteController {
  constructor(private rewrite: RewriteService) {}

  @Get('match')
  match(@Query('path') path = '') {
    return this.rewrite.match(path);
  }

  @Get('rules')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  rules() {
    return this.rewrite.rules();
  }

  @Get('conflicts')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  conflicts() {
    return this.rewrite.conflicts();
  }

  @Post('rules')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  create(@Body() dto: RuleDto) {
    return this.rewrite.create(dto);
  }

  @Delete('rules/:id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  remove(@Param('id') id: string) {
    return this.rewrite.remove(id);
  }
}
