import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RewriteController } from './rewrite.controller';
import { RewriteService } from './rewrite.service';

@Module({
  imports: [SettingsModule],
  controllers: [RewriteController],
  providers: [RewriteService],
  exports: [RewriteService],
})
export class RewriteModule {}
