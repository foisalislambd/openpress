import { Module } from '@nestjs/common';
import { ExtensionsModule } from '../extensions/extensions.module';
import { SettingsModule } from '../settings/settings.module';
import { ModelingController } from './modeling.controller';
import { ModelingService } from './modeling.service';

@Module({
  imports: [SettingsModule, ExtensionsModule],
  controllers: [ModelingController],
  providers: [ModelingService],
  exports: [ModelingService],
})
export class ModelingModule {}
