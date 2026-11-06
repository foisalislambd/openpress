import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilitiesGuard, RequireCaps } from '../auth/capabilities.guard';
import { AssistantService } from './assistant.service';

class CompleteDto {
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  context?: string;
}

@Controller('assistant')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCaps('edit_posts')
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Post('complete')
  complete(@Body() dto: CompleteDto) {
    return this.assistant.complete(dto);
  }
}
