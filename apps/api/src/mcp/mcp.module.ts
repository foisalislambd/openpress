import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { McpController } from './mcp.controller';

@Module({
  imports: [ContentModule],
  controllers: [McpController, AssistantController],
  providers: [AssistantService],
})
export class McpModule {}
