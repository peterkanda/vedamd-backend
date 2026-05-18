import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';

/**
 * SRS §6.3.9 — Identity, Authentication, Authorization.
 * v0.1 leans on Supabase Auth (OAuth2/OIDC) for users and API keys; SMART
 * on FHIR launch and KMPDC/Nursing Council verification land in later passes.
 */
@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
