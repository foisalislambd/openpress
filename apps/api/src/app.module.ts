import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContentModule } from './content/content.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { MediaModule } from './media/media.module';
import { CommentsModule } from './comments/comments.module';
import { SettingsModule } from './settings/settings.module';
import { ExtensionsModule } from './extensions/extensions.module';
import { HooksModule } from './hooks/hooks.module';
import { FeedsModule } from './feeds/feeds.module';
import { ToolsModule } from './tools/tools.module';
import { ApiKeyMiddleware } from './auth/api-key.middleware';
import { AppPasswordMiddleware } from './auth/app-password.middleware';
import { GraphqlModule } from './graphql/graphql.module';
import { I18nModule } from './i18n/i18n.module';
import { JobsModule } from './jobs/jobs.module';
import { McpModule } from './mcp/mcp.module';
import { ModelingModule } from './modeling/modeling.module';
import { PlatformModule } from './platform/platform.module';
import { WpModule } from './rest/wp.module';
import { CapabilitiesModule } from './auth/capabilities.module';
import { CronModule } from './cron/cron.module';
import { MenusModule } from './menus/menus.module';
import { RewriteModule } from './rewrite/rewrite.module';
import { WidgetsModule } from './widgets/widgets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // Global rate limit: 120 requests/minute per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DbModule,
    HooksModule,
    CapabilitiesModule,
    PlatformModule,
    AuthModule,
    UsersModule,
    ContentModule,
    TaxonomyModule,
    MediaModule,
    CommentsModule,
    SettingsModule,
    ExtensionsModule,
    FeedsModule,
    ToolsModule,
    ModelingModule,
    JobsModule,
    I18nModule,
    WpModule,
    McpModule,
    GraphqlModule,
    MenusModule,
    WidgetsModule,
    RewriteModule,
    CronModule,
  ],
  providers: [
    AppPasswordMiddleware,
    ApiKeyMiddleware,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AppPasswordMiddleware, ApiKeyMiddleware).forRoutes('*');
  }
}
