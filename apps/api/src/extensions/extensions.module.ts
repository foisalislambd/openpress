import { Module } from '@nestjs/common';
import {
  InstalledThemesController,
  PluginsController,
} from './extensions.controller';
import { PluginsService } from './plugins.service';
import { InstalledThemesService } from './themes.service';

@Module({
  controllers: [PluginsController, InstalledThemesController],
  providers: [PluginsService, InstalledThemesService],
})
export class ExtensionsModule {}
