import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
  createCategory(@Body() dto: CategoryDto) {
    return this.taxonomy.createCategory(dto.name, dto.description, dto.parentId);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard)
  updateCategory(@Param('id') id: string, @Body() dto: Partial<CategoryDto>) {
    return this.taxonomy.updateCategory(id, dto.name, dto.description);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  removeCategory(@Param('id') id: string) {
    return this.taxonomy.removeCategory(id);
  }

  @Get('tags')
  tags() {
    return this.taxonomy.tags();
  }

  @Post('tags')
  @UseGuards(JwtAuthGuard)
  createTag(@Body() dto: TagDto) {
    return this.taxonomy.createTag(dto.name);
  }

  @Delete('tags/:id')
  @UseGuards(JwtAuthGuard)
  removeTag(@Param('id') id: string) {
    return this.taxonomy.removeTag(id);
  }
}
