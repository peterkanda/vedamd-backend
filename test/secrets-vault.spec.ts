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
    // Flip the last byte, rather than assigning it a constant.
    //
    // This used to set it to "00", which is only a tamper when the byte was
    // not already zero. AES-GCM is a stream cipher, so the final ciphertext
    // byte is uniformly random — once every 256 runs the "tampered" value
    // was byte-identical to the original, decryption correctly succeeded and
    // the test failed. XOR guarantees a different byte every time.
    const lastByte = Number.parseInt(cipher.slice(-2), 16);
    const flipped = (lastByte ^ 0xff).toString(16).padStart(2, '0');
    const tampered = `${iv}:${cipher.slice(0, -2)}${flipped}:${tag}`;
    expect(tampered).not.toBe(ct);
    expect(() => decryptSecret(tampered, 'tenant-A')).toThrow();
  });
});
