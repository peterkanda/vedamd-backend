import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/supabase-auth/supabase-auth.guard';
import { AssistantService, type AssistantChatResponse } from './assistant.service';
import { AssistantChatDto } from './assistant.dto';

/**
 * Mobile assistant chat — the cloud (OpenAI) path for the VedaMD app. Requires
 * a valid Supabase session (the clinician's app login). Grounds the answer in
 * the verified knowledge base and reasons via the configured LLM provider, with
 * the same anti-hallucination posture as the on-device model.
 */
@ApiTags('assistant')
@Controller('v1/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Grounded clinical chat for the mobile app (cloud model).' })
  async chat(@Body() dto: AssistantChatDto): Promise<AssistantChatResponse> {
    return this.assistant.chat({ question: dto.question, conversation: dto.conversation });
  }
}
