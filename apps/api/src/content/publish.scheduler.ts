import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ContentService } from './content.service';

@Injectable()
export class PublishScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private content: ContentService) {}

  onModuleInit() {
    void this.content.publishDue().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.content.publishDue().catch(() => undefined);
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
