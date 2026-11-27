import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WidgetsModule } from '../widgets/widgets.module';
import { CronModule } from '../cron/cron.module';
import {
  InstalledThemesController,
  PluginsController,
} from './extensions.controller';
import { PluginsService } from './plugins.service';
import { InstalledThemesService } from './themes.service';

@Module({
  imports: [AuthModule, WidgetsModule, CronModule],
  controllers: [PluginsController, InstalledThemesController],
  providers: [PluginsService, InstalledThemesService],
  exports: [InstalledThemesService],
})
export class ExtensionsModule {}
