import { Injectable } from '@nestjs/common';

@Injectable()
export class TenancyService {
  async resolveTenant(_subdomainOrHeader: string): Promise<{ id: string } | null> {
    return null;
  }
}
