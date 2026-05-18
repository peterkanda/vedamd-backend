import { Injectable } from '@nestjs/common';

@Injectable()
export class KnowledgeService {
  async listRules(): Promise<unknown[]> {
    return [];
  }
}
