import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { DbService } from '../db/db.service';
import { AuditService } from './audit.service';

class RedirectDto {
  @IsString()
  @Matches(/^\/[a-zA-Z0-9/_-]*$/)
  @MaxLength(200)
  fromPath!: string;

  @IsString()
  @Matches(/^\/[a-zA-Z0-9/_-]*$/)
  @MaxLength(200)
  toPath!: string;
}

@Controller()
export class PlatformController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get('health')
  async health() {
    const row = await this.db.one<{ ok: number }>('SELECT 1 AS ok');
    return {
      ok: row?.ok === 1,
      service: 'openpress-api',
      version: '0.1.0',
      demo: process.env.DEMO_MODE === 'true',
    };
  }

  @Get('redirects/lookup')
  async lookup(@Query('path') path = '') {
    if (!path.startsWith('/') || path.includes('..')) return { to: null };
    const row = await this.db.one<{ toPath: string; statusCode: number }>(
      'SELECT "toPath", "statusCode" FROM redirects WHERE "fromPath" = $1',
      [path.replace(/\/$/, '') || '/'],
    );
    return row ? { to: row.toPath, statusCode: row.statusCode } : { to: null };
  }

  @Post('redirects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async addRedirect(@Body() dto: RedirectDto) {
    await this.db.query(
      `INSERT INTO redirects (id, "fromPath", "toPath") VALUES ($1, $2, $3)
       ON CONFLICT ("fromPath") DO UPDATE SET "toPath" = EXCLUDED."toPath"`,
      [randomUUID(), dto.fromPath, dto.toPath],
    );
    return { from: dto.fromPath, to: dto.toPath };
  }

  @Get('audit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  auditLog() {
    return this.audit.list();
  }
}
