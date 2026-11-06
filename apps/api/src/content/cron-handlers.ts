import { Injectable, OnModuleInit } from '@nestjs/common';
import { HooksService } from '../hooks/hooks.service';
import { ContentService } from './content.service';

@Injectable()
export class CoreCronHandlers implements OnModuleInit {
  constructor(
    private hooks: HooksService,
    private content: ContentService,
  ) {}

  onModuleInit() {
    this.hooks.addAction('openpress.publish_due', () => this.content.publishDue());
    this.hooks.addAction('openpress.purge_stale', () => this.content.purgeStale());
  }
}
