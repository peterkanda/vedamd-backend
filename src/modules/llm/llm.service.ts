import { Injectable } from '@nestjs/common';

@Injectable()
export class LlmService {
  async explain(_recommendation: unknown): Promise<string> {
    return '';
  }

  async parseFreeText(_text: string): Promise<unknown> {
    return null;
  }
}
