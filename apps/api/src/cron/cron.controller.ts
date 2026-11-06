import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { CronService } from './cron.service';

class ScheduleDto {
  @IsString()
  @MinLength(1)
  hook!: string;

  @IsOptional()
  @IsArray()
  args?: unknown[];

  @IsOptional()
  @IsString()
  runAt?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  intervalSeconds?: number;
}

@Controller('cron')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCaps('manage_options')
export class CronController {
  constructor(private cron: CronService) {}

  @Get()
  list() {
    return this.cron.list();
  }

  @Post()
  schedule(@Body() dto: ScheduleDto) {
    return this.cron.schedule(dto);
  }

  @Post('run')
  run() {
    return this.cron.tick();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cron.unschedule(id);
  }
}
