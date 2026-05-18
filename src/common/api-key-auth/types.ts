import type { ApiKeyEnvironment, ApiKeyScope } from '../../modules/developer/api-keys.service';

/**
 * The authenticated caller, attached to the Fastify request at
 * `request.apiKey` once an `ApiKeyGuard` has accepted it.
 */
export interface AuthenticatedApiKey {
  keyId: string;
  integratorId: string;
  fingerprint: string;
  scopes: ApiKeyScope[];
  environment: ApiKeyEnvironment;
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: AuthenticatedApiKey;
  }
}
