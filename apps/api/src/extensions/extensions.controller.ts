import {
  All,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { normalize, resolve } from 'path';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ExtensionRegistry } from './extension-registry';
import { PluginsService } from './plugins.service';
import { InstalledThemesService } from './themes.service';

const zipUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

@Controller('plugins')
export class PluginsController {
  constructor(
    private plugins: PluginsService,
    private registry: ExtensionRegistry,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  list() {
    return this.plugins.list();
  }

  @Get('registry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  registryView() {
    return {
      menus: this.registry.adminPages(),
      blocks: this.registry.blocksForEditor(),
      widgets: this.registry.widgetTypes(),
    };
  }

  @Get('chrome')
  async chrome() {
    const settings = await this.plugins.widgetAreas();
    return {
      assets: this.registry.assetsForSite(),
      blocks: this.registry.blocksForEditor(),
      widgets: {
        sidebar: await this.registry.renderWidgets(settings.sidebar),
        footer: await this.registry.renderWidgets(settings.footer),
      },
    };
  }

  @Get('files/:id/*file')
  file(@Param('id') id: string, @Param('file') file: string | string[], @Res() res: Response) {
    const relative = (Array.isArray(file) ? file.join('/') : file).replace(/^\/+/, '');
    if (!relative || relative.includes('..')) throw new BadRequestException('Invalid asset path');
    const registered = this.registry.assetFile(id, relative);
    if (!registered) throw new NotFoundException('Asset not found');
    const root = resolve(process.cwd(), 'plugins', id);
    const target = resolve(root, normalize(relative));
    if (!target.startsWith(root) || !existsSync(target)) throw new NotFoundException('Asset not found');
    if (registered.kind === 'style') res.type('text/css');
    else res.type('application/javascript');
    createReadStream(target).pipe(res);
  }

  @All(':id/rest/*path')
  async rest(
    @Param('id') id: string,
    @Param('path') path: string | string[],
    @Query() query: Record<string, string>,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const routePath = `/${(Array.isArray(path) ? path.join('/') : path).replace(/^\/+/, '')}`;
    const result = await this.registry.route(id, req.method, routePath, query, body);
    if (result === null) throw new NotFoundException('Plugin route not found');
    return result;
  }

  @Get(':id/settings/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async settings(@Param('id') id: string, @Param('slug') slug: string) {
    const page = this.registry.page(id, slug);
    if (!page) throw new NotFoundException('Plugin page not found');
    return { page, values: await this.plugins.getSettings(id) };
  }

  @Patch(':id/settings/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  saveSettings(
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.plugins.updateSettings(id, body, slug);
  }

  @Get('updates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updates() {
    return this.plugins.updates();
  }

  @Post('stage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(zipUpload)
  stage(@UploadedFile() file: Express.Multer.File) {
    return this.plugins.stage(file);
  }

  @Post('stage/:token/commit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  commit(@Param('token') token: string) {
    return this.plugins.commit(token);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(zipUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.plugins.stage(file);
  }

  @Post(':id/rollback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  rollback(@Param('id') id: string) {
    return this.plugins.rollback(id);
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

  @Get('installed/:id/bundle.js')
  @Header('Content-Type', 'text/javascript')
  bundle(@Param('id') id: string) {
    return this.themes.bundle(id);
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
