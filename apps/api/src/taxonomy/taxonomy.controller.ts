import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CapabilitiesService } from '../auth/capabilities.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaxonomyService } from './taxonomy.service';

class CategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

class TagDto {
  @IsString()
  @MinLength(1)
  name: string;
}

@Controller('taxonomy')
export class TaxonomyController {
  constructor(
    private taxonomy: TaxonomyService,
    private caps: CapabilitiesService,
  ) {}

  @Get('categories')
  categories() {
    return this.taxonomy.categories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  async createCategory(@Body() dto: CategoryDto, @CurrentUser() user: JwtPayload) {
    await this.assertTerms(user);
    return this.taxonomy.createCategory(dto.name, dto.description, dto.parentId);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard)
  async updateCategory(@Param('id') id: string, @Body() dto: Partial<CategoryDto>, @CurrentUser() user: JwtPayload) {
    await this.assertTerms(user);
    return this.taxonomy.updateCategory(id, dto.name, dto.description);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  async removeCategory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertTerms(user);
    return this.taxonomy.removeCategory(id);
  }

  @Get('tags')
  tags() {
    return this.taxonomy.tags();
  }

  @Post('tags')
  @UseGuards(JwtAuthGuard)
  async createTag(@Body() dto: TagDto, @CurrentUser() user: JwtPayload) {
    await this.assertTerms(user);
    return this.taxonomy.createTag(dto.name);
  }

  @Delete('tags/:id')
  @UseGuards(JwtAuthGuard)
  async removeTag(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertTerms(user);
    return this.taxonomy.removeTag(id);
  }

  private async assertTerms(user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'manage_categories'))) {
      throw new ForbiddenException('You cannot manage categories or tags');
    }
  }
}
