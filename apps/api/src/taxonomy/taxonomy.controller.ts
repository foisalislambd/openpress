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
import { can } from '../auth/capabilities';
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
  constructor(private taxonomy: TaxonomyService) {}

  @Get('categories')
  categories() {
    return this.taxonomy.categories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  createCategory(@Body() dto: CategoryDto, @CurrentUser() user: JwtPayload) {
    this.assertTerms(user);
    return this.taxonomy.createCategory(dto.name, dto.description, dto.parentId);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard)
  updateCategory(@Param('id') id: string, @Body() dto: Partial<CategoryDto>, @CurrentUser() user: JwtPayload) {
    this.assertTerms(user);
    return this.taxonomy.updateCategory(id, dto.name, dto.description);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  removeCategory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.assertTerms(user);
    return this.taxonomy.removeCategory(id);
  }

  @Get('tags')
  tags() {
    return this.taxonomy.tags();
  }

  @Post('tags')
  @UseGuards(JwtAuthGuard)
  createTag(@Body() dto: TagDto, @CurrentUser() user: JwtPayload) {
    this.assertTerms(user);
    return this.taxonomy.createTag(dto.name);
  }

  @Delete('tags/:id')
  @UseGuards(JwtAuthGuard)
  removeTag(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.assertTerms(user);
    return this.taxonomy.removeTag(id);
  }

  private assertTerms(user: JwtPayload) {
    if (!can(user.role, 'manage_categories')) {
      throw new ForbiddenException('You cannot manage categories or tags');
    }
  }
}
