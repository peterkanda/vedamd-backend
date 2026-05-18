import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CdsService } from './cds.service';
import type { StatelessCapability } from './cds.types';

/**
 * FR-093 — Machine-readable declaration of stateless operation.
 *
 * Compliance auditors and integrators can fetch this without
 * authentication to verify the platform's posture.
 */
@ApiTags('capability')
@Controller('metadata')
export class CdsCapabilityController {
  constructor(private readonly cds: CdsService) {}

  @Get()
  @ApiOperation({
    summary: 'Stateless CapabilityStatement',
    description:
      'CapabilityStatement-shaped declaration of stateless operation (FR-093). Includes the http://vedamd.io/CapabilityStatement/stateless extension set to true.',
  })
  get(): StatelessCapability {
    return this.cds.capabilityStatement();
  }
}
