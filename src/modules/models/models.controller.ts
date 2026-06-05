import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModelsService } from './models.service';

/**
 * On-device model distribution (FR-148). The mobile app reads these
 * endpoints once while online to learn which MedGemma build to
 * download + how to verify it, then runs the assistant fully offline.
 *
 * Stateless: no PHI, no per-user state — pure content distribution,
 * safely cacheable at the edge.
 */
@ApiTags('models')
@Controller('v1/models')
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get()
  @ApiOperation({
    summary: 'Catalog of on-device models VedaMD distributes',
    description: 'FR-148 — manifests for downloadable offline assistant models.',
  })
  list() {
    return this.models.list();
  }

  @Get('medgemma/current')
  @ApiOperation({
    summary: 'Current MedGemma 4B multimodal build for mobile',
    description:
      'The "always-current" manifest the mobile app downloads + verifies, then runs offline. ' +
      'Update the build by changing MEDGEMMA_* env on vedamd.io; clients pick it up on next sync.',
  })
  medgemmaCurrent() {
    return this.models.medgemmaCurrent();
  }

  @Get(':id/current')
  @ApiOperation({ summary: 'Current build manifest for a model family by id' })
  byId(@Param('id') id: string) {
    if (id === 'medgemma' || id === 'medgemma-4b-multimodal') {
      return this.models.medgemmaCurrent();
    }
    throw new NotFoundException(`Unknown model family: ${id}`);
  }
}
