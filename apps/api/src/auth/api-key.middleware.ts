import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { scopeAllows } from '../cms/publishing';
import { ApiKeyService } from './api-key.service';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private keys: ApiKeyService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? '';
    if (!/^Bearer\s+opk_/i.test(header)) {
      next();
      return;
    }
    const user = await this.keys.authenticate(header);
    if (!user) {
      res.status(401).json({ message: 'Invalid API key' });
      return;
    }
    const path = req.originalUrl || req.url || '';
    if (!scopeAllows(user.scopes, req.method, path)) {
      res.status(403).json({ message: 'API key scope does not allow this request' });
      return;
    }
    (req as Request & { user?: unknown; authVia?: string }).user = user;
    (req as Request & { authVia?: string }).authVia = 'api-key';
    next();
  }
}
