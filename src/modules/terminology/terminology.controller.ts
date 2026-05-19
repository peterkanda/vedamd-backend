import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TerminologyService } from './terminology.service';

@ApiTags('terminology')
@Controller('v1/terminology')
export class TerminologyController {
  constructor(private readonly terminology: TerminologyService) {}

  @Get('lookup')
  lookup(@Query('system') system: string, @Query('code') code: string) {
    return this.terminology.lookup(system, code);
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.terminology.search(q);
  }
}
