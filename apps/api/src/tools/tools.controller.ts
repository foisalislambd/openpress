import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsObject, IsOptional } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { FieldMapping } from '../feeds/emdash';
import { ToolsService } from './tools.service';

class EmDashDto {
  @IsObject()
  document!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  mapping?: FieldMapping;
}

@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EDITOR')
export class ToolsController {
  constructor(private tools: ToolsService) {}

  @Get('export/wxr')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="openpress-export.xml"')
  exportWxr() {
    return this.tools.exportWxr();
  }

  @Post('import/wxr')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  importWxr(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    if (!file?.buffer?.length) throw new BadRequestException('Upload a WXR .xml file');
    return this.tools.importWxr(file.buffer.toString('utf8'), user);
  }

  @Post('import/emdash/preview')
  previewEmDash(@Body() dto: EmDashDto) {
    return this.tools.previewEmDash(dto.document, dto.mapping);
  }

  @Post('import/emdash')
  importEmDash(@Body() dto: EmDashDto, @CurrentUser() user: JwtPayload) {
    return this.tools.importEmDash(dto.document, dto.mapping, user);
  }

  @Get('imports/:id')
  job(@Param('id') id: string) {
    return this.tools.job(id);
  }
}
