import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PlatformController } from './platform.controller';

@Global()
@Module({
  controllers: [PlatformController],
  providers: [AuditService],
  exports: [AuditService],
})
export class PlatformModule {}
