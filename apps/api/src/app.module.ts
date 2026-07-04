import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContentModule } from './content/content.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { MediaModule } from './media/media.module';
import { CommentsModule } from './comments/comments.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ContentModule,
    TaxonomyModule,
    MediaModule,
    CommentsModule,
    SettingsModule,
  ],
})
export class AppModule {}
