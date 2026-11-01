import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ authVia?: string; user?: { sub?: string } }>();
    if (req.authVia === 'app-password' && req.user?.sub) return true;
    return super.canActivate(context);
  }
}
