import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { WpController } from './wp.controller';
import { WpService } from './wp.service';

@Module({
  imports: [ContentModule, AuthModule],
  controllers: [WpController],
  providers: [WpService],
})
export class WpModule {}
