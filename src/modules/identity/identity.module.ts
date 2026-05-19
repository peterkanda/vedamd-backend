import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';

/**
 * SRS §6.3.9 — Operator Identity, AuthN, AuthZ.
 *
 * VedaMD does not manage patient identity (FR-165). This module
 * authenticates OPERATORS only: integrator admins, clinical authors,
 * system operators, auditors. Patient identity belongs to the
 * calling EMR.
 */
@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
