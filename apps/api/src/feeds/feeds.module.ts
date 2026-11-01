import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FeedsController } from './feeds.controller';

@Module({
  imports: [SettingsModule],
  controllers: [FeedsController],
})
export class FeedsModule {}
