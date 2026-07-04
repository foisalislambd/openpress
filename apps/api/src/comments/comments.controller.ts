import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CommentsService } from './comments.service';

class CreateCommentDto {
  @IsString()
  contentId: string;

  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsString()
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
  constructor(private comments: CommentsService) {}

  // Public: approved comments for one piece of content
  @Get('content/:contentId')
  forContent(@Param('contentId') contentId: string) {
    return this.comments.findForContent(contentId);
  }

  // Public: guests can submit (goes to moderation)
  @Post()
  create(@Body() dto: CreateCommentDto) {
    return this.comments.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EDITOR')
  findAll(@Query('status') status?: string) {
    return this.comments.findAll(status);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EDITOR')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.comments.setStatus(id, dto.status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EDITOR')
  remove(@Param('id') id: string) {
    return this.comments.remove(id);
  }
}
