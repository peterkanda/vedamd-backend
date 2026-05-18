import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  async ruleInvocations(_ruleId: string): Promise<{ invocations: number; fires: number; overrides: number }> {
    return { invocations: 0, fires: 0, overrides: 0 };
  }
}
