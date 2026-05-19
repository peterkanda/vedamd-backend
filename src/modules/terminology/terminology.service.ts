import { Injectable } from '@nestjs/common';

@Injectable()
export class TerminologyService {
  async lookup(_system: string, _code: string): Promise<unknown> {
    return null;
  }

  async search(_query: string): Promise<unknown[]> {
    return [];
  }
}
