import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ContentCacheInterceptor } from './content-cache.interceptor';
import { KnowledgeModule } from '../../modules/knowledge/knowledge.module';

/**
 * Registers the ContentCacheInterceptor globally. It only acts on routes
 * marked with @ImmutableContent, so it's a no-op for every other endpoint.
 */
@Module({
  imports: [KnowledgeModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ContentCacheInterceptor }],
})
export class HttpCacheModule {}
