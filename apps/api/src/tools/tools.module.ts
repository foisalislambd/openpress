import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({
  imports: [SettingsModule],
  controllers: [ToolsController],
  providers: [ToolsService],
})
export class ToolsModule {}
