import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * SRS §6.3.6 — LLM Orchestration Layer.
 * Pluggable backends (Claude / GPT / self-hosted Llama / UlizaLlama).
 * LLM never makes a clinical decision alone — deterministic engine is authoritative.
 */
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
