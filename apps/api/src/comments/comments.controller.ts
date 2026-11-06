import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { CommentsService } from './comments.service';

class CreateCommentDto {
  @IsString()
  contentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestName?: string;

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

class SetStatusDto {
  @IsIn(['PENDING', 'APPROVED', 'SPAM', 'TRASHED'])
  status: string;
}

@Controller('comments')
export class CommentsController {
  constructor(
    private comments: CommentsService,
    private jwt: JwtService,
  ) {}

  // Public: approved comments for one piece of content
  @Get('content/:contentId')
  forContent(@Param('contentId') contentId: string) {
    return this.comments.findForContent(contentId);
  }

  // Public: guests can submit (goes to moderation). Stricter rate limit.
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  create(@Body() dto: CreateCommentDto, @Req() req: Request) {
    return this.comments.create({
      ...dto,
      authorId: this.reader(req),
      authorIp: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('moderate_comments')
  findAll(@Query('status') status?: string) {
    return this.comments.findAll(status);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('moderate_comments')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.comments.setStatus(id, dto.status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('moderate_comments')
  remove(@Param('id') id: string) {
    return this.comments.remove(id);
  }

  private reader(req: Request) {
    const header = req.headers.authorization;
    if (!header?.toLowerCase().startsWith('bearer ') || header.slice(7).startsWith('opk_')) return undefined;
    try {
      const payload = this.jwt.verify<{ sub?: string; purpose?: string }>(header.slice(7).trim());
      if (payload.purpose && payload.purpose !== 'access') return undefined;
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
