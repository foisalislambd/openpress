import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ToolsService } from './tools.service';

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

  @Get('imports/:id')
  job(@Param('id') id: string) {
    return this.tools.job(id);
  }
}
