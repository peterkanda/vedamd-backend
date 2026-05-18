/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Generate an Ed25519 keypair for signing content bundles.
 *
 * Usage:
 *   npm run keys:generate -- --out ./dev-keys
 *
 * Writes:
 *   <out>/private-key.pem  (chmod 600; never commit)
 *   <out>/public-key.pem   (commit alongside the bundle)
 *
 * Production keys live in a key store (KMS / sealed secrets / HSM)
 * and are NEVER written to disk in plaintext like this. This script
 * is intended only for local dev and CI fixtures.
 */
function parseArgs(argv: string[]): { out: string } {
  const out = argv.find((a, i) => argv[i - 1] === '--out') ?? './dev-keys';
  return { out };
}

const { out } = parseArgs(process.argv.slice(2));
const outDir = resolve(process.cwd(), out);
mkdirSync(outDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const privPath = resolve(outDir, 'private-key.pem');
const pubPath = resolve(outDir, 'public-key.pem');

writeFileSync(privPath, privateKey.export({ format: 'pem', type: 'pkcs8' }) as string, {
  mode: 0o600,
});
writeFileSync(pubPath, publicKey.export({ format: 'pem', type: 'spki' }) as string);

// eslint-disable-next-line no-console
console.log(`Wrote:\n  ${privPath} (mode 0600 — DO NOT COMMIT)\n  ${pubPath}`);
// Suppress unused-import lint for dirname when not needed.
void dirname;
