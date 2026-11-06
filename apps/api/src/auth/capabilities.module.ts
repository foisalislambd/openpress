import { Global, Module } from '@nestjs/common';
import { CapabilitiesGuard } from './capabilities.guard';
import { CapabilitiesService } from './capabilities.service';
import { RolesController } from './roles.controller';

@Global()
@Module({
  controllers: [RolesController],
  providers: [CapabilitiesService, CapabilitiesGuard],
  exports: [CapabilitiesService, CapabilitiesGuard],
})
export class CapabilitiesModule {}
