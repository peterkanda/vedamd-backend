import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DrugsService } from './drugs.service';

@ApiTags('drugs')
@Controller('v1/drugs')
export class DrugsController {
  constructor(private readonly drugs: DrugsService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.drugs.search(q);
  }

  @Post('interactions')
  interactions(@Body() body: { rxcuis: string[] }) {
    return this.drugs.checkInteractions(body.rxcuis ?? []);
  }
}
