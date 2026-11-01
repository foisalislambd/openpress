import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AppPasswordService } from './app-password.service';

@Injectable()
export class AppPasswordMiddleware implements NestMiddleware {
  constructor(private passwords: AppPasswordService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Basic ')) {
      const user = await this.passwords.authenticate(header);
      if (user) {
        (req as Request & { user?: unknown; authVia?: string }).user = user;
        (req as Request & { authVia?: string }).authVia = 'app-password';
      }
    }
    next();
  }
}
