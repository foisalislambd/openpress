import { Module } from '@nestjs/common';
import { WidgetsModule } from '../widgets/widgets.module';
import {
  InstalledThemesController,
  PluginsController,
} from './extensions.controller';
import { PluginsService } from './plugins.service';
import { InstalledThemesService } from './themes.service';

@Module({
  imports: [WidgetsModule],
  controllers: [PluginsController, InstalledThemesController],
  providers: [PluginsService, InstalledThemesService],
})
export class ExtensionsModule {}
