import { Injectable } from '@nestjs/common';

@Injectable()
export class SyncService {
  async currentBundle(): Promise<{ version: string | null }> {
    return { version: null };
  }
}
