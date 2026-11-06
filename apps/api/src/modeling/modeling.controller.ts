import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ModelingService } from './modeling.service';

class PostTypeDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  singular?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  public?: boolean;

  @IsOptional()
  @IsBoolean()
  hierarchical?: boolean;

  @IsOptional()
  @IsBoolean()
  hasArchive?: boolean;

  @IsOptional()
  @IsArray()
  supports?: string[];
}

class TaxonomyDto {
  @IsString()
  slug!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  singular?: string;

  @IsOptional()
  @IsBoolean()
  hierarchical?: boolean;

  @IsOptional()
  @IsBoolean()
  public?: boolean;

  @IsOptional()
  @IsArray()
  postTypes?: string[];
}

class TermDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

class FieldGroupDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsArray()
  postTypes?: string[];

  @IsOptional()
  @IsString()
  position?: string;
}

class FieldDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

class PatternDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  content?: unknown[];

  @IsOptional()
  @IsBoolean()
  synced?: boolean;
}

@Controller('modeling')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EDITOR')
export class ModelingController {
  constructor(private modeling: ModelingService) {}

  @Get('post-types')
  postTypes() {
    return this.modeling.listPostTypes();
  }

  @Post('post-types')
  @Roles('ADMIN')
  createPostType(@Body() dto: PostTypeDto) {
    return this.modeling.createPostType(dto);
  }

  @Delete('post-types/:slug')
  @Roles('ADMIN')
  deletePostType(@Param('slug') slug: string) {
    return this.modeling.deletePostType(slug);
  }

  @Get('taxonomies')
  taxonomies() {
    return this.modeling.listTaxonomies();
  }

  @Post('taxonomies')
  @Roles('ADMIN')
  createTaxonomy(@Body() dto: TaxonomyDto) {
    return this.modeling.createTaxonomy(dto);
  }

  @Delete('taxonomies/:slug')
  @Roles('ADMIN')
  deleteTaxonomy(@Param('slug') slug: string) {
    return this.modeling.deleteTaxonomy(slug);
  }

  @Get('taxonomies/:slug/terms')
  terms(@Param('slug') slug: string) {
    return this.modeling.listTerms(slug);
  }

  @Post('taxonomies/:slug/terms')
  createTerm(@Param('slug') slug: string, @Body() dto: TermDto) {
    return this.modeling.createTerm(slug, dto);
  }

  @Delete('terms/:id')
  deleteTerm(@Param('id') id: string) {
    return this.modeling.deleteTerm(id);
  }

  @Get('field-groups')
  fieldGroups(@Query('postType') postType?: string) {
    return this.modeling.listFieldGroups(postType);
  }

  @Post('field-groups')
  @Roles('ADMIN')
  createFieldGroup(@Body() dto: FieldGroupDto) {
    return this.modeling.createFieldGroup(dto);
  }

  @Post('field-groups/:id/fields')
  @Roles('ADMIN')
  addField(@Param('id') id: string, @Body() dto: FieldDto) {
    return this.modeling.addField(id, dto);
  }

  @Delete('field-groups/:id')
  @Roles('ADMIN')
  deleteFieldGroup(@Param('id') id: string) {
    return this.modeling.deleteFieldGroup(id);
  }

  @Delete('fields/:id')
  @Roles('ADMIN')
  deleteField(@Param('id') id: string) {
    return this.modeling.deleteField(id);
  }

  @Get('patterns')
  patterns() {
    return this.modeling.listPatterns();
  }

  @Post('patterns')
  createPattern(@Body() dto: PatternDto) {
    return this.modeling.createPattern({ title: dto.title ?? '', content: dto.content, synced: dto.synced });
  }

  @Patch('patterns/:id')
  updatePattern(@Param('id') id: string, @Body() dto: PatternDto) {
    return this.modeling.updatePattern(id, dto);
  }

  @Delete('patterns/:id')
  deletePattern(@Param('id') id: string) {
    return this.modeling.deletePattern(id);
  }
}
