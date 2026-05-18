import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service';
import { PhiFreeLogger } from '../../src/common/phi-free-logger';
import type { AppConfig } from '../../src/config/configuration';

/**
 * Build a KnowledgeService that loads the committed dev bundle from
 * disk. Used by domain-service unit tests so they exercise the real
 * content shape end-to-end without booting Nest.
 */
export function makeKnowledgeService(): KnowledgeService {
  const bundleDir = resolve(process.cwd(), 'content/bundles/v0.1.0');
  const config = {
    get: (key: string) => {
      if (key === 'content.bundleDir') return bundleDir;
      if (key === 'content.strictVerification') return true;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true });
  const svc = new KnowledgeService(config, log);
  svc.loadFromConfig();
  return svc;
}
