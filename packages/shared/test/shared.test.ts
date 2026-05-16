import { describe, it, expect } from 'vitest';
import {
  normalizeIdentifier,
  hkdfSha256,
  aeadSeal,
  aeadOpen,
  sealPayload,
  openPayload,
  dummyBlob,
  deriveLookupTag,
  deriveWalletKey,
  WALLET_BLOB_LEN,
  NONCE_LEN,
  utf8,
  toHex,
  randomBytes,
} from '@bbnew/shared';

describe('normalizeIdentifier', () => {
  it('is idempotent and collapses equivalent formattings', () => {
    const a = normalizeIdentifier('REF/2024/0099', 'UNHCR');
    const b = normalizeIdentifier('ref-2024-0099', 'UNHCR');
    const c = normalizeIdentifier(' Ref 2024 0099 ', 'UNHCR');
    expect(a).toBe('UNHCR:REF20240099');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('namespaces by scheme so identical digits do not collide', () => {
    expect(normalizeIdentifier('12345', 'NID')).not.toBe(
      normalizeIdentifier('12345', 'TAX'),
    );
  });

  it('rejects an empty identifier', () => {
    expect(() => normalizeIdentifier('  --  ', 'NID')).toThrow();
  });
});

describe('hkdf + tagging', () => {
  it('hkdf is deterministic and length-correct', async () => {
    const ikm = utf8('ikm');
    const k1 = await hkdfSha256(ikm, utf8('salt'), utf8('info'), 32);
    const k2 = await hkdfSha256(ikm, utf8('salt'), utf8('info'), 32);
    expect(k1.length).toBe(32);
    expect(toHex(k1)).toBe(toHex(k2));
  });

  it('lookup tag changes with key version (rotation unlinkability)', async () => {
    const raw = randomBytes(32);
    const t0 = await deriveLookupTag(raw, 0);
    const t1 = await deriveLookupTag(raw, 1);
    expect(toHex(t0)).not.toBe(toHex(t1));
    const e0 = await deriveWalletKey(raw, 0);
    expect(toHex(e0)).not.toBe(toHex(await deriveWalletKey(raw, 1)));
  });
});

describe('AEAD fixed-length, match-oblivious', () => {
  it('round-trips a payload and authenticates the AAD', async () => {
    const key = randomBytes(32);
    const aad = utf8('ctx');
    const s = await sealPayload(key, JSON.stringify({ o: 'M1', w: '0xabc' }), aad);
    expect(s.ciphertext.length).toBe(WALLET_BLOB_LEN);
    expect(s.nonce.length).toBe(NONCE_LEN);
    expect(await openPayload(key, s.nonce, s.ciphertext, aad)).toBe(
      JSON.stringify({ o: 'M1', w: '0xabc' }),
    );
  });

  it('returns null on tampered ciphertext or wrong AAD (no throw)', async () => {
    const key = randomBytes(32);
    const s = await sealPayload(key, 'secret', utf8('aad'));
    const tampered = new Uint8Array(s.ciphertext);
    tampered[0] ^= 0xff;
    expect(await openPayload(key, s.nonce, tampered, utf8('aad'))).toBeNull();
    expect(await openPayload(key, s.nonce, s.ciphertext, utf8('other'))).toBeNull();
    expect(await aeadOpen(key, s.nonce, tampered, utf8('aad'))).toBeNull();
  });

  it('a non-match dummy blob is byte-indistinguishable in length from a real one', async () => {
    const key = randomBytes(32);
    const real = await sealPayload(key, JSON.stringify({ o: 'MX', w: '0xdead' }), utf8('a'));
    const dummy = dummyBlob();
    expect(dummy.ciphertext.length).toBe(real.ciphertext.length);
    expect(dummy.nonce.length).toBe(real.nonce.length);
    // and a dummy never decrypts under any honest key ⇒ "no match"
    expect(await openPayload(key, dummy.nonce, dummy.ciphertext, utf8('a'))).toBeNull();
  });

  it('aeadSeal/aeadOpen generic round-trip', async () => {
    const key = randomBytes(32);
    const s = await aeadSeal(key, utf8('hello'), utf8('aad'));
    const out = await aeadOpen(key, s.nonce, s.ciphertext, utf8('aad'));
    expect(out && new TextDecoder().decode(out)).toBe('hello');
  });
});
