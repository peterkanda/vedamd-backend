import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';
import { IdentityService } from '../src/modules/identity/identity.service';
import type { AppConfig } from '../src/config/configuration';

/**
 * Proves the IdentityService correctly verifies asymmetric (ES256) JWTs
 * against a remote JWKS — the exact shape Supabase Auth uses today.
 *
 *   - Generates an ES256 keypair locally
 *   - Serves the public key as a JWKS document on a random localhost port
 *   - Signs a JWT with the matching private key
 *   - Verifies IdentityService accepts the valid token, rejects a tampered one,
 *     and rejects a token signed by an unrelated key
 */

const ISSUER = 'https://example-issuer.test/auth/v1';
const AUDIENCE = 'authenticated';

function makeConfig(jwksUrl: string): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'identity.jwksUrl') return jwksUrl;
      if (key === 'identity.issuer') return ISSUER;
      if (key === 'identity.audience') return AUDIENCE;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

describe('IdentityService — ES256 JWKS verification (Supabase-shaped)', () => {
  let server: Server;
  let jwksUrl: string;
  let privateKey: KeyLike;
  let unrelatedPrivateKey: KeyLike;
  let identity: IdentityService;

  beforeAll(async () => {
    const main = await generateKeyPair('ES256', { extractable: true });
    const stranger = await generateKeyPair('ES256', { extractable: true });
    privateKey = main.privateKey;
    unrelatedPrivateKey = stranger.privateKey;

    const publicJwk: JWK = await exportJWK(main.publicKey);
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';
    publicJwk.kid = 'test-key-1';

    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    jwksUrl = `http://127.0.0.1:${port}/jwks.json`;

    identity = new IdentityService(makeConfig(jwksUrl));
    identity.onModuleInit();
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function sign(
    payload: Record<string, unknown>,
    key: KeyLike = privateKey,
  ): Promise<string> {
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  it('accepts a well-formed JWT signed by the JWKS key', async () => {
    const token = await sign({ sub: 'user-uuid-1', role: 'authenticated' });
    const claims = await identity.verifyAccessToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe('user-uuid-1');
    expect(claims!.aud).toBe(AUDIENCE);
    expect(claims!.iss).toBe(ISSUER);
  });

  it('rejects a token signed by an unrelated key (signature mismatch)', async () => {
    const token = await sign({ sub: 'user-uuid-2' }, unrelatedPrivateKey);
    const claims = await identity.verifyAccessToken(token);
    expect(claims).toBeNull();
  });

  it('rejects a tampered token (payload mutated after signing)', async () => {
    const token = await sign({ sub: 'user-uuid-3' });
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    const tampered = `${h}.${forgedPayload}.${s}`;
    const claims = await identity.verifyAccessToken(tampered);
    expect(claims).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await identity.verifyAccessToken('not-a-jwt')).toBeNull();
    expect(await identity.verifyAccessToken('')).toBeNull();
  });
});
