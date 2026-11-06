import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Allow, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireAnyCap, RequireCaps } from '../auth/capabilities.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { CapabilitiesService } from '../auth/capabilities.service';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

class MetaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  key!: string;

  @Allow()
  value!: unknown;
}

class AccessDto {
  @IsArray()
  @IsString({ each: true })
  grants!: string[];

  @IsArray()
  @IsString({ each: true })
  denies!: string[];
}

@Controller('users')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class UsersController {
  constructor(
    private users: UsersService,
    private caps: CapabilitiesService,
  ) {}

  @Get()
  @RequireCaps('list_users')
  findAll(
    @Query('role') role?: string,
    @Query('search') search?: string,
    @Query('capability') capability?: string,
  ) {
    return this.users.findAll({ role, search, capability });
  }

  @Get(':id/meta')
  @RequireAnyCap('read', 'list_users', 'edit_users')
  meta(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.users.listMeta(id, user.sub);
  }

  @Put(':id/meta')
  @RequireAnyCap('read', 'edit_users')
  upsertMeta(@Param('id') id: string, @Body() dto: MetaDto, @CurrentUser() user: JwtPayload) {
    return this.users.upsertMeta(id, user.sub, dto.key, dto.value);
  }

  @Delete(':id/meta/:key')
  @RequireAnyCap('read', 'edit_users')
  deleteMeta(@Param('id') id: string, @Param('key') key: string, @CurrentUser() user: JwtPayload) {
    return this.users.deleteMeta(id, user.sub, key);
  }

  @Put(':id/access')
  @RequireCaps('edit_users')
  access(@Param('id') id: string, @Body() dto: AccessDto) {
    return this.caps.setUserAccess(id, dto.grants ?? [], dto.denies ?? []);
  }

  @Get(':id')
  @RequireCaps('list_users')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequireCaps('create_users')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.users.create(dto, user.sub);
  }

  @Patch(':id')
  @RequireCaps('edit_users')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: JwtPayload) {
    return this.users.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequireCaps('delete_users')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.users.remove(id, user.sub);
  }
}
