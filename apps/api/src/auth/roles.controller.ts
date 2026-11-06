import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ArrayUnique, IsArray, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CapabilitiesGuard, RequireAnyCap, RequireCaps } from './capabilities.guard';
import { CapabilitiesService } from './capabilities.service';

class RoleDto {
  @IsString()
  @MinLength(2)
  label!: string;

  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,40}$/)
  slug!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilities!: string[];
}

class RolePatchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilities?: string[];
}

@Controller('roles')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class RolesController {
  constructor(private capabilities: CapabilitiesService) {}

  @Get('catalog')
  @RequireAnyCap('list_users', 'edit_users', 'manage_options')
  catalog() {
    return this.capabilities.catalog();
  }

  @Get()
  @RequireAnyCap('list_users', 'edit_users', 'manage_options')
  list() {
    return this.capabilities.roles();
  }

  @Post()
  @RequireCaps('manage_options')
  create(@Body() dto: RoleDto) {
    return this.capabilities.createRole(dto.label, dto.slug, dto.capabilities);
  }

  @Patch(':slug')
  @RequireCaps('manage_options')
  update(@Param('slug') slug: string, @Body() dto: RolePatchDto) {
    return this.capabilities.updateRole(slug.toUpperCase(), dto);
  }

  @Delete(':slug')
  @RequireCaps('manage_options')
  remove(@Param('slug') slug: string) {
    return this.capabilities.deleteRole(slug.toUpperCase());
  }
}
