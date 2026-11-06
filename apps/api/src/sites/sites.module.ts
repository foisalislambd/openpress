import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SiteMiddleware } from './site.middleware';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { TransientsService } from './transients.service';

@Global()
@Module({
  controllers: [SitesController],
  providers: [SitesService, SiteMiddleware, TransientsService],
  exports: [SitesService, SiteMiddleware, TransientsService],
})
export class SitesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SiteMiddleware).forRoutes('*');
  }
}
