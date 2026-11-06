import { Module } from '@nestjs/common';
import { ModelingModule } from '../modeling/modeling.module';
import { SettingsModule } from '../settings/settings.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PermalinksController } from './permalinks.controller';
import { PublishScheduler } from './publish.scheduler';
import { CoreCronHandlers } from './cron-handlers';

@Module({
  imports: [SettingsModule, ModelingModule],
  controllers: [ContentController, PermalinksController],
  providers: [ContentService, PublishScheduler, CoreCronHandlers],
  exports: [ContentService],
})
export class ContentModule {}
