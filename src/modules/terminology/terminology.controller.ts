import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TerminologyService } from './terminology.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('terminology')
@Controller('v1/terminology')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class TerminologyController {
  constructor(private readonly terminology: TerminologyService) {}

  @Get('systems')
  @RequireScope('terminology:read')
  @ApiOperation({
    summary: 'List loaded code systems (FR-040, FR-041)',
    description:
      'Catalogue of every code system in the active content bundle: URI, short id, publisher, license, and concept count.',
  })
  systems() {
    return { systems: this.terminology.listSystems() };
  }

  @Get('lookup')
  @RequireScope('terminology:read')
  @ApiOperation({
    summary: 'FHIR $lookup — resolve display + metadata for a (system, code) pair (FR-042)',
    description:
      'Both system URI (e.g. http://loinc.org) and short id (e.g. loinc) are accepted. Returns 404 if the code is not present in the bundle.',
  })
  lookup(@Query('system') system: string, @Query('code') code: string) {
    if (!system || !code) {
      throw new BadRequestException('Both `system` and `code` query parameters are required.');
    }
    const result = this.terminology.lookup(system, code);
    if (!result) throw new NotFoundException(`Code ${code} not found in ${system}`);
    return result;
  }

  @Get('validate-code')
  @RequireScope('terminology:read')
  @ApiOperation({
    summary:
      'FHIR $validate-code — assert (system, code) is valid; optional display check (FR-042)',
  })
  validate(
    @Query('system') system: string,
    @Query('code') code: string,
    @Query('display') display?: string,
  ) {
    if (!system || !code) {
      throw new BadRequestException('Both `system` and `code` query parameters are required.');
    }
    return this.terminology.validateCode(system, code, display);
  }

  @Get('search')
  @RequireScope('terminology:read')
  @ApiOperation({
    summary: 'Free-text concept search (FR-044)',
    description:
      'Ranks matches across the loaded code systems. Optional `systemId` restricts to one (icd-10, loinc, atc, aware).',
  })
  search(
    @Query('q') q: string,
    @Query('systemId') systemId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('Query parameter `q` is required (min 2 characters).');
    }
    const parsedLimit = limit ? Math.max(1, Math.min(200, Number(limit))) : 25;
    return { hits: this.terminology.search(q, systemId, parsedLimit) };
  }

  @Get('value-sets/:id/$expand')
  @RequireScope('terminology:read')
  @ApiOperation({
    summary: 'FHIR $expand — enumerate the concepts of a value set (FR-042)',
  })
  expand(@Param('id') id: string) {
    const out = this.terminology.expand(id);
    if (!out) throw new NotFoundException(`Unknown value set: ${id}`);
    return out;
  }
}
