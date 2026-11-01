import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PublishScheduler } from './publish.scheduler';

@Module({
  controllers: [ContentController],
  providers: [ContentService, PublishScheduler],
})
export class ContentModule {}
