import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/supabase-auth/supabase-auth.guard';
import { DeviceAuditService, type SyncOutcome } from './device-audit.service';
import { DeviceAnswerSyncDto } from './device-audit.dto';

/**
 * Receives the on-device assistant's answer log when the phone regains
 * connectivity.
 *
 * Authenticated as the clinician (the app's Supabase session), not as an
 * integrator — the on-device assistant is used by a clinician directly, which
 * is also why `integration_log` does not apply to it.
 */
@ApiTags('assistant')
@Controller('v1/device-audit')
export class DeviceAuditController {
  constructor(private readonly deviceAudit: DeviceAuditService) {}

  @Post('answers')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Sync the on-device assistant answer log (PHI-free: hashed question, cited record ids, model version and flags only).',
  })
  async sync(
    @Body() dto: DeviceAnswerSyncDto,
    @Req() req: { supabaseUser?: { id: string } },
  ): Promise<SyncOutcome> {
    const clinicianId = req.supabaseUser?.id;
    // The guard should have set this; without it the records cannot be
    // attributed and must not be stored under a guessed actor.
    if (!clinicianId) throw new UnauthorizedException('No authenticated clinician on the request.');
    return this.deviceAudit.sync(clinicianId, dto.reports ?? []);
  }
}
