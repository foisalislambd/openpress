import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Allow, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { NetworkService } from './network.service';

class NetworkSettingsDto {
  @IsOptional()
  @IsString()
  networkTitle?: string;

  @IsOptional()
  @IsBoolean()
  allowNewSites?: boolean;
}

class MembershipDto {
  @IsString()
  siteId!: string;

  @Allow()
  role!: string | null;
}

class NetworkUserDto {
  @IsOptional()
  @IsBoolean()
  networkAdmin?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MembershipDto)
  memberships?: MembershipDto[];
}

@Controller('network')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class NetworkController {
  constructor(private network: NetworkService) {}

  @Get('settings')
  @RequireCaps('manage_network_options')
  settings() {
    return this.network.settings();
  }

  @Put('settings')
  @RequireCaps('manage_network_options')
  saveSettings(@Body() dto: NetworkSettingsDto) {
    return this.network.saveSettings(dto);
  }

  @Get('users')
  @RequireCaps('manage_network_users')
  users() {
    return this.network.users();
  }

  @Put('users/:id')
  @RequireCaps('manage_network_users')
  updateUser(@Param('id') id: string, @Body() dto: NetworkUserDto, @CurrentUser() user: JwtPayload) {
    return this.network.updateUser(user.sub, id, dto);
  }
}
