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
import { AppPasswordMiddleware } from './auth/app-password.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // Global rate limit: 120 requests/minute per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DbModule,
    HooksModule,
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
  ],
  providers: [
    AppPasswordMiddleware,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AppPasswordMiddleware).forRoutes('*');
  }
}
