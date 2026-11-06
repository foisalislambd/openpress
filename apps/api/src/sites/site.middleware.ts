import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { runWithSite } from './site-context';
import { SitesService } from './sites.service';

@Injectable()
export class SiteMiddleware implements NestMiddleware {
  constructor(private sites: SitesService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const slug = header(req, 'x-openpress-site');
    const host = header(req, 'x-openpress-host') || header(req, 'host');
    this.sites
      .resolve({ slug, host })
      .then((siteId) => runWithSite(siteId, () => next()))
      .catch(() => runWithSite('site_main', () => next()));
  }
}

function header(req: Request, name: string) {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
}
