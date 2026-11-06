import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { WidgetsModule } from '../widgets/widgets.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [MenusModule, WidgetsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
