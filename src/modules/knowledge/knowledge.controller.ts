import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge')
@Controller('v1/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('bundle')
  @ApiOperation({
    summary: 'Return the loaded content bundle metadata',
    description:
      'Unauthenticated by design — auditors and integrators can verify which signed content bundle the platform is serving (version, signer, signedAt, per-file SHA-256, verification status). No clinical content is returned here.',
  })
  bundle() {
    return this.knowledge.getInfo();
  }
}
