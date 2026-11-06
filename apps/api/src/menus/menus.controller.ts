import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { MenusService } from './menus.service';

class MenuDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

class ItemDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsIn(['custom', 'post', 'page', 'category', 'tag'])
  type?: string;
}

class ItemPatchDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}

class LocationsDto {
  @IsOptional()
  @IsString()
  primary?: string | null;

  @IsOptional()
  @IsString()
  footer?: string | null;
}

@Controller('menus')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCaps('edit_theme_options')
export class MenusController {
  constructor(private menus: MenusService) {}

  @Get()
  list() {
    return this.menus.list();
  }

  @Put('locations')
  locations(@Body() dto: LocationsDto) {
    return this.menus.setLocations(dto);
  }

  @Patch('items/:itemId')
  updateItem(@Param('itemId') itemId: string, @Body() dto: ItemPatchDto) {
    return this.menus.updateItem(itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(@Param('itemId') itemId: string) {
    return this.menus.removeItem(itemId);
  }

  @Post()
  create(@Body() dto: MenuDto) {
    return this.menus.create(dto.name);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: ItemDto) {
    return this.menus.addItem(id, dto);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() dto: MenuDto) {
    return this.menus.rename(id, dto.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menus.remove(id);
  }
}
