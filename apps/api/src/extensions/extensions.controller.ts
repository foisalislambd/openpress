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
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createReadStream, existsSync } from 'fs';
import { normalize, resolve } from 'path';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { ExtensionRegistry } from './extension-registry';
import { PluginsService } from './plugins.service';
import { WidgetsService } from '../widgets/widgets.service';
import { InstalledThemesService } from './themes.service';
import { HooksService } from '../hooks/hooks.service';
import { sanitizeFooterHtml, sanitizeHeadHtml } from './head-html';
import { isolatedAppCsp } from './isolated-app';
import { ACCESS_COOKIE, readCookie } from '../auth/session-cookie';

const zipUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

@Controller('plugins')
export class PluginsController {
  constructor(
    private plugins: PluginsService,
    private registry: ExtensionRegistry,
    private widgets: WidgetsService,
    private hooks: HooksService,
    private jwt: JwtService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  list() {
    return this.plugins.list();
  }

  @Get('registry')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  registryView() {
    return {
      menus: this.registry.adminPages(),
      blocks: this.registry.blocksForEditor(),
      widgets: this.registry.widgetTypes(),
      metaBoxes: this.registry.listMetaBoxes(),
      notices: this.registry.listNotices(),
      dashboard: this.registry.dashboardWidgets(),
    };
  }

  @Get('chrome')
  async chrome() {
    const rendered = await this.widgets.renderPublic();
    const head = await this.hooks.applyFilters('wp_head', [] as string[]);
    const footer = await this.hooks.applyFilters('wp_footer', [] as string[]);
    return {
      assets: this.registry.assetsForSite(),
      blocks: this.registry.blocksForEditor(),
      widgets: rendered.widgets,
      areas: rendered.areas,
      metaBoxes: this.registry.listMetaBoxes(),
      head: sanitizeHeadHtml(head),
      footer: sanitizeFooterHtml(footer),
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

  @Post(':id/forms/:formId')
  async submitForm(@Param('id') id: string, @Param('formId') formId: string, @Body() body: unknown) {
    const form = this.registry.form(id, formId);
    if (!form) throw new NotFoundException('Form not found');
    const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const values: Record<string, string> = {};
    for (const field of form.fields) {
      const value = source[field.key];
      if (typeof value !== 'string') continue;
      values[field.key] = value.slice(0, field.type === 'textarea' ? 5000 : 500);
    }
    return form.submit(values);
  }

  @Get('block-editor')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('edit_posts')
  blockEditor(@Query('name') name: string | undefined, @Res() res: Response) {
    const block = this.registry.blockByName(String(name || ''));
    if (!block?.editor) throw new NotFoundException('Block editor not found');
    res.setHeader('Content-Security-Policy', isolatedAppCsp(process.env.WEB_ORIGIN));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('html').send(this.plugins.isolatedDocument(block.pluginId, block.editor));
  }

  @Get(':id/app/:slug')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  app(@Param('id') id: string, @Param('slug') slug: string, @Res() res: Response) {
    const page = this.registry.page(id, slug);
    if (!page || page.screen !== 'app' || !page.entry) throw new NotFoundException('Plugin screen not found');
    res.setHeader('Content-Security-Policy', isolatedAppCsp(process.env.WEB_ORIGIN));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('html').send(this.plugins.isolatedDocument(id, page.entry));
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
    const route = this.registry.matchRoute(id, req.method, routePath);
    if (!route) throw new NotFoundException('Plugin route not found');
    if (route.auth && !(await this.sessionUser(req))) throw new UnauthorizedException('Sign in required');
    return route.handler({ query, body });
  }

  private async sessionUser(req: Request) {
    const header = req.header('authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = bearer || readCookie(req, ACCESS_COOKIE);
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync(token);
    } catch {
      return null;
    }
  }

  @Get(':id/collections/:name')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  records(@Param('id') id: string, @Param('name') name: string) {
    return this.plugins.records(id, name);
  }

  @Get(':id/content')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  pluginContent(@Param('id') id: string, @Query('postType') postType?: string) {
    return this.plugins.pluginContent(id, postType);
  }

  @Post(':id/content')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  createPluginContent(@Param('id') id: string, @Body() body: { title?: string; postType?: string }) {
    return this.plugins.createPluginContent(id, body);
  }

  @Get(':id/dashboard/:widgetId')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('read')
  async dashboard(@Param('id') id: string, @Param('widgetId') widgetId: string) {
    const html = await this.registry.renderDashboard(id, widgetId);
    if (html == null) throw new NotFoundException('Dashboard widget not found');
    return { html };
  }

  @Get(':id/settings/:slug')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  async settings(@Param('id') id: string, @Param('slug') slug: string) {
    const page = this.registry.page(id, slug);
    if (!page) throw new NotFoundException('Plugin page not found');
    return { page, values: await this.plugins.getSettings(id) };
  }

  @Patch(':id/settings/:slug')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  saveSettings(
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.plugins.updateSettings(id, body, slug);
  }

  @Get('updates')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  updates() {
    return this.plugins.updates();
  }

  @Post('stage')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  @UseInterceptors(zipUpload)
  stage(@UploadedFile() file: Express.Multer.File) {
    return this.plugins.stage(file);
  }

  @Post('stage/:token/commit')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  commit(@Param('token') token: string) {
    return this.plugins.commit(token);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  @UseInterceptors(zipUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.plugins.stage(file);
  }

  @Post(':id/rollback')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  rollback(@Param('id') id: string) {
    return this.plugins.rollback(id);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  toggle(@Param('id') id: string) {
    return this.plugins.toggle(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
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
    return this.themes.resolved(id);
  }

  @Get('installed/:id/template')
  template(@Param('id') id: string, @Query('name') name?: string) {
    return this.themes.readTemplate(id, name || 'index');
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
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  @UseInterceptors(zipUpload)
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.themes.install(file);
  }

  @Delete('installed/:id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCaps('activate_plugins')
  remove(@Param('id') id: string) {
    return this.themes.remove(id);
  }
}
