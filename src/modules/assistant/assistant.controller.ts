import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/supabase-auth/supabase-auth.guard';
import { AssistantService, type AssistantChatResponse } from './assistant.service';
import { AssistantChatDto } from './assistant.dto';
import { stashClinicalAudit, type AuditableRequest } from '../audit/clinical-audit.types';

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
  async chat(
    @Body() dto: AssistantChatDto,
    // This path had no audit or logging at all, and the controller discarded
    // the request — so a clinician's cloud answer left no record anywhere.
    @Req() req: { supabaseUser?: { id: string } } & AuditableRequest,
  ): Promise<AssistantChatResponse> {
    const res = await this.assistant.chat({
      question: dto.question,
      conversation: dto.conversation,
    });
    stashClinicalAudit(req, {
      kind: 'assistant',
      llmInvoked: res.provider !== 'none',
      llmProvider: res.provider !== 'none' ? res.provider : undefined,
      llmModel: res.model !== 'none' ? res.model : undefined,
      cardsReturned: 0,
      citations: res.sources.map((s) => ({ kind: s.domain, id: s.slug })),
      refusedReason: res.refused
        ? 'ungrounded_clinical_claim'
        : res.provider === 'none'
          ? 'no_clinical_grade_model'
          : undefined,
      actorId: req.supabaseUser?.id,
    });
    return res;
  }
}
