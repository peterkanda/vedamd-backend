import { describe, expect, it, beforeEach } from 'vitest';
import {
  decryptJson,
  decryptSecret,
  encryptJson,
  encryptSecret,
} from '../src/common/secrets-vault';

describe('secrets-vault (AES-256-GCM envelope)', () => {
  beforeEach(() => {
    // Use a deterministic 32-byte hex master key so tests are reproducible.
    process.env.SECRETS_VAULT_MASTER_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips a string with matching AAD', () => {
    const ct = encryptSecret('hello', 'tenant-A');
    expect(ct.split(':')).toHaveLength(3);
    expect(decryptSecret(ct, 'tenant-A')).toBe('hello');
  });

  it('fails to decrypt when the AAD does not match (tenant isolation)', () => {
    const ct = encryptSecret('hello', 'tenant-A');
    expect(() => decryptSecret(ct, 'tenant-B')).toThrow();
  });

  it('produces a different ciphertext on each call (IV randomness)', () => {
    const a = encryptSecret('hello', 'tenant-A');
    const b = encryptSecret('hello', 'tenant-A');
    expect(a).not.toBe(b);
  });

  it('round-trips JSON via the json helpers', () => {
    const payload = { accountSid: 'AC123', authToken: 'tok', fromNumber: '+14155551234' };
    const ct = encryptJson(payload, 'tenant-X');
    const decoded = decryptJson<typeof payload>(ct, 'tenant-X');
    expect(decoded).toEqual(payload);
  });

  it('throws on a tampered ciphertext', () => {
    const ct = encryptSecret('hello', 'tenant-A');
    const [iv, cipher, tag] = ct.split(':');
    // Flip one byte in the ciphertext.
    const tampered = `${iv}:${cipher.slice(0, -2)}00:${tag}`;
    expect(() => decryptSecret(tampered, 'tenant-A')).toThrow();
  });
});
