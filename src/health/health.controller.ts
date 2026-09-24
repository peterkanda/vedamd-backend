import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthIndicatorResult } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { KnowledgeService } from '../modules/knowledge/knowledge.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.contentBundle()]);
  }

  /**
   * A bundle that failed verification loads as empty: every CDS hook then
   * answers "no cards", which reads as "nothing to flag". Outside production
   * that happened with no signal at all, because the health check checked
   * nothing. Report it, so the platform marks the instance unhealthy.
   */
  private contentBundle(): HealthIndicatorResult {
    const info = this.knowledge.getInfo();
    return {
      content_bundle: {
        status: info.verified ? 'up' : 'down',
        version: info.version,
        verification: info.verificationStatus,
      },
    };
  }
}
