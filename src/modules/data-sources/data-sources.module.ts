import { Module } from '@nestjs/common';
import { DataSourcesController } from './data-sources.controller';
import { DataSourcesService } from './data-sources.service';
import { AgenticModule } from '../agentic/agentic.module';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Per-integrator SQL connection + named-query registration. Persistent
 * (DB-backed when DATABASE_URL is set) so connections survive restarts
 * and integrators don't need env-var access. URLs are AEAD-encrypted.
 *
 * Pushes every connection + query into SqlIngestionService's in-memory
 * registry at create / update / boot, so agentic + audit flows see
 * them without any restart.
 */
@Module({
  imports: [AgenticModule, IdentityModule],
  controllers: [DataSourcesController],
  providers: [DataSourcesService, OperatorAuthGuard],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
