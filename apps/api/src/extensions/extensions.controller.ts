import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { PluginsService } from './plugins.service';
import { InstalledThemesService } from './themes.service';

const zipUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

@Controller('plugins')
export class PluginsController {
  constructor(private plugins: PluginsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  list() {
    return this.plugins.list();
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(zipUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.plugins.install(file);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  toggle(@Param('id') id: string) {
    return this.plugins.toggle(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.plugins.remove(id);
  }
}

@Controller('themes')
export class InstalledThemesController {
  constructor(private themes: InstalledThemesService) {}

  // Public: the site needs to load runtime themes
  @Get('installed')
  list() {
    return this.themes.list();
  }

  @Get('installed/:id')
  manifest(@Param('id') id: string) {
    return this.themes.manifest(id);
  }

  @Get('installed/:id/style.css')
  @Header('Content-Type', 'text/css')
  css(@Param('id') id: string) {
    return this.themes.customCss(id);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(zipUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.themes.install(file);
  }

  @Delete('installed/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.themes.remove(id);
  }
}
