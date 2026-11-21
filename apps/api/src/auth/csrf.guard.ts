import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE, readCookie, safeEqual } from './session-cookie';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
    if (req.headers.authorization?.startsWith('Bearer ')) return true;
    const cookieAuth = Boolean(readCookie(req, ACCESS_COOKIE) || readCookie(req, REFRESH_COOKIE));
    if (!cookieAuth) return true;
    const expected = readCookie(req, CSRF_COOKIE);
    const header = req.header('x-openpress-csrf') ?? '';
    if (!expected || expected.length < 16 || !header || !safeEqual(expected, header)) {
      throw new ForbiddenException('CSRF token missing or invalid');
    }
    return true;
  }
}
