import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LocalizationService } from './localization.service';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('localization')
@Controller('v1/localization')
@ImmutableContent()
export class LocalizationController {
  constructor(private readonly localization: LocalizationService) {}

  @Get()
  @ApiOperation({
    summary: 'Supported countries + localization status',
    description:
      'Drives the client country picker. Lists selectable countries, which are localized to national guidelines, the default country (Kenya), and the global baseline authority (WHO). Countries that are not yet localized are still selectable and served default reference content with a "not yet localized" label. Public, no PHI.',
  })
  directory() {
    return this.localization.directory();
  }
}
