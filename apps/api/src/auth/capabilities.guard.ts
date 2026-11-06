import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilitiesService } from './capabilities.service';

export const CAPS_KEY = 'openpress_caps';

export interface CapRequirement {
  caps: string[];
  mode: 'all' | 'any';
}

export const RequireCaps = (...caps: string[]) =>
  SetMetadata(CAPS_KEY, { caps, mode: 'all' } satisfies CapRequirement);

export const RequireAnyCap = (...caps: string[]) =>
  SetMetadata(CAPS_KEY, { caps, mode: 'any' } satisfies CapRequirement);

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private capabilities: CapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<CapRequirement>(CAPS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.caps?.length) return true;
    const user = context.switchToHttp().getRequest().user as { sub?: string } | undefined;
    if (!user?.sub) throw new ForbiddenException('Missing capability');
    const allowed =
      required.mode === 'any'
        ? await this.capabilities.allowsAny(user.sub, required.caps)
        : await this.capabilities.allowsAll(user.sub, required.caps);
    if (!allowed) throw new ForbiddenException('Missing capability');
    return true;
  }
}
