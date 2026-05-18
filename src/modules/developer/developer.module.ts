import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

/**
 * SRS §6.3.16 — Developer Portal (backend).
 *
 * v0.1 ships the API-key lifecycle endpoints used by developer.vedamd.io
 * (FR-313): create, list, rotate, revoke, with fingerprints-only on
 * read. Self-service signup (FR-311), sandbox provisioning (FR-312),
 * and OAuth client registration (FR-314) land in subsequent commits.
 */
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class DeveloperModule {}
