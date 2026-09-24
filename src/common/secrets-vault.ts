import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * AES-256-GCM envelope encryption for per-integrator secrets
 * (notification-channel credentials, future connection strings).
 *
 * Why it exists: integrators upload Twilio / Africa's Talking /
 * SMTP / WhatsApp Business credentials so VedaMD can send alerts on
 * their behalf. Storing them plaintext in the database would mean a
 * single read-only leak (a SELECT in a routine dump, a misconfigured
 * Supabase Studio session, a stolen backup) exposes every integrator's
 * outbound credentials at once. AES-GCM with a master key in env vars
 * separates the database compromise from the credential compromise.
 *
 * Master key:
 *   - `SECRETS_VAULT_MASTER_KEY` env var, base64 or hex (≥ 32 bytes).
 *   - If unset (dev / unit-test), a deterministic dev-only key is used
 *     with a loud warning. NEVER acceptable in production.
 *   - Rotating the master key requires re-encrypting every row; that
 *     workflow is a follow-up and not blocking this build.
 *
 * Wire format: `<iv-hex>:<ciphertext-hex>:<authTag-hex>`.
 *   - 12-byte IV (GCM standard) + ciphertext + 16-byte auth tag.
 *   - AAD includes the integrator ID so a row stolen from one tenant
 *     cannot be decrypted as another tenant's credential.
 */

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;
let cachedWarned = false;

function loadMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.SECRETS_VAULT_MASTER_KEY?.trim();
  if (!raw) {
    // Fail closed in production: without a real master key, every tenant's
    // credentials would be encrypted under a key reproducible from this
    // source tree, so AES-GCM would provide zero confidentiality. Refuse to
    // boot rather than silently ship that.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SECRETS_VAULT_MASTER_KEY must be set in production — refusing to start with the dev fallback key.',
      );
    }
    if (!cachedWarned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[secrets-vault] SECRETS_VAULT_MASTER_KEY is not set — falling back to a dev-only deterministic key. DO NOT USE IN PRODUCTION.',
      );
      cachedWarned = true;
    }
    // Deterministic dev key (scrypt from a fixed string). Cannot be used
    // to decrypt production rows because production never sees this.
    cachedKey = scryptSync('vedamd-dev-vault-do-not-ship', 'vedamd-dev-vault-salt', KEY_BYTES);
    return cachedKey;
  }
  // Accept hex or base64.
  let key: Buffer;
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_BYTES * 2) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SECRETS_VAULT_MASTER_KEY must decode to exactly ${KEY_BYTES} bytes; got ${key.length}.`,
    );
  }
  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext JSON-serialisable payload. `aad` should be a
 * stable per-tenant identifier (typically the integratorId) so a
 * leaked ciphertext from tenant A cannot be decrypted as tenant B.
 */
export function encryptSecret(plaintext: string, aad: string): string {
  const key = loadMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${authTag.toString('hex')}`;
}

export function decryptSecret(encoded: string, aad: string): string {
  const key = loadMasterKey();
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid secret envelope format.');
  }
  const [ivHex, ctHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== IV_BYTES) throw new Error('Invalid IV length.');
  if (tag.length !== AUTH_TAG_BYTES) throw new Error('Invalid auth tag length.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Convenience wrappers for encrypting structured (JSON) payloads. */
export function encryptJson(payload: unknown, aad: string): string {
  return encryptSecret(JSON.stringify(payload), aad);
}

export function decryptJson<T = unknown>(encoded: string, aad: string): T {
  return JSON.parse(decryptSecret(encoded, aad)) as T;
}
