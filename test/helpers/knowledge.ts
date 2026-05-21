import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service';
import { PhiFreeLogger } from '../../src/common/phi-free-logger';
import type { AppConfig } from '../../src/config/configuration';

export interface KnowledgeHarnessOptions {
  strict?: boolean;
  requireApproved?: boolean;
  bundleDir?: string;
  /** Defaults to true so unit tests exercise the SNOMED-enabled path. */
  snomedEnabled?: boolean;
}

/**
 * Build a KnowledgeService that loads the committed dev bundle from
 * disk. Used by domain-service unit tests so they exercise the real
 * content shape end-to-end without booting Nest.
 */
export function makeKnowledgeService(opts: KnowledgeHarnessOptions = {}): KnowledgeService {
  const bundleDir = opts.bundleDir ?? resolve(process.cwd(), 'content/bundles/v0.1.0');
  const strict = opts.strict ?? true;
  const requireApproved = opts.requireApproved ?? false;
  const config = {
    get: (key: string) => {
      if (key === 'content.bundleDir') return bundleDir;
      if (key === 'content.strictVerification') return strict;
      if (key === 'content.requireApproved') return requireApproved;
      // Unit tests exercise the SNOMED-enabled ("licensed") path by
      // default; the production runtime defaults this to false.
      if (key === 'content.snomedEnabled') return opts.snomedEnabled ?? true;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true });
  const svc = new KnowledgeService(config, log);
  svc.loadFromConfig();
  return svc;
}
