import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { MailService } from './mail.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [SettingsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, MailService],
  exports: [WebhooksService, MailService],
})
export class JobsModule {}
