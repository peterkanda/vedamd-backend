import { Module } from '@nestjs/common';
import { DeviceAuditController } from './device-audit.controller';
import { DeviceAuditService } from './device-audit.service';

/**
 * Audit trail for the on-device assistant.
 *
 * The server-side interceptor cannot see these answers — the on-device model
 * runs with no network — so the app keeps a capped local log and hands it over
 * when it next has connectivity.
 */
@Module({
  controllers: [DeviceAuditController],
  providers: [DeviceAuditService],
  exports: [DeviceAuditService],
})
export class DeviceAuditModule {}
