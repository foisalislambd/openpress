import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { CapabilitiesService } from '../auth/capabilities.service';
import { SitesService } from './sites.service';

class CreateSiteDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  slug!: string;

  @IsOptional()
  @IsString()
  domain?: string;
}

class UpdateSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class SiteOptionDto {
  @IsString()
  key!: string;

  @Allow()
  value: unknown;
}

@Controller('sites')
export class SitesController {
  constructor(
    private sites: SitesService,
    private caps: CapabilitiesService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: JwtPayload) {
    const network = await this.caps.allows(user.sub, 'manage_sites');
    return this.sites.listForUser(user.sub, network);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_sites')
  create(@Body() dto: CreateSiteDto) {
    return this.sites.create(dto);
  }

  @Get('current/options')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  options() {
    return this.sites.options();
  }

  @Put('current/options')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_options')
  setOption(@Body() dto: SiteOptionDto) {
    return this.sites.setOption(dto.key, dto.value);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_sites')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sites.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('manage_sites')
  remove(@Param('id') id: string) {
    return this.sites.remove(id);
  }
}
