import { Injectable } from '@nestjs/common';

@Injectable()
export class DrugsService {
  async search(_q: string): Promise<unknown[]> {
    return [];
  }

  async checkInteractions(_rxcuis: string[]): Promise<unknown[]> {
    return [];
  }
}
