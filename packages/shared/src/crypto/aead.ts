import { randomBytes, utf8, fromUtf8 } from '../bytes.js';

/**
 * AES-256-GCM AEAD (Web Crypto, zero dependencies).
 *
 * The lookup payload (owner member id + wallet address, sealed together) is
 * padded to a FIXED length before encryption so that every real ciphertext has
 * an identical byte length. A non-match response is a uniformly random blob of
 * exactly that length, making match vs. non-match indistinguishable on the
 * wire. This invariant is security-critical — see `WALLET_BLOB_LEN`.
 */

export const NONCE_LEN = 12;
/** Fixed plaintext block: 2-byte LE length prefix + payload, zero-padded. */
const PLAINTEXT_LEN = 96;
const GCM_TAG_LEN = 16;
/** Every real or dummy lookup blob is exactly this many bytes. */
export const WALLET_BLOB_LEN = PLAINTEXT_LEN + GCM_TAG_LEN;

function importAesKey(key: Uint8Array) {
  if (key.length !== 32) throw new Error('aead: AES-256-GCM key must be 32 bytes');
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export interface Sealed {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

/** Generic AEAD seal (used by tests). Plaintext length is not hidden here. */
export async function aeadSeal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Sealed> {
  const k = await importAesKey(key);
  const nonce = randomBytes(NONCE_LEN);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad },
    k,
    plaintext,
  );
  return { nonce, ciphertext: new Uint8Array(ct) };
}

/** Generic AEAD open. Returns `null` on authentication failure (no throw). */
export async function aeadOpen(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array | null> {
  const k = await importAesKey(key);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad },
      k,
      ciphertext,
    );
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

function pad(payload: string): Uint8Array {
  const body = utf8(payload);
  if (body.length + 2 > PLAINTEXT_LEN) {
    throw new Error(`sealPayload: payload too long (${body.length} bytes)`);
  }
  const block = new Uint8Array(PLAINTEXT_LEN); // zero-filled
  block[0] = body.length & 0xff;
  block[1] = (body.length >> 8) & 0xff;
  block.set(body, 2);
  return block;
}

function unpad(block: Uint8Array): string | null {
  if (block.length !== PLAINTEXT_LEN) return null;
  const len = block[0]! | (block[1]! << 8);
  if (len < 0 || 2 + len > PLAINTEXT_LEN) return null;
  return fromUtf8(block.subarray(2, 2 + len));
}

/** Seal a short payload string into a fixed-length (`WALLET_BLOB_LEN`) ciphertext. */
export async function sealPayload(
  key: Uint8Array,
  payload: string,
  aad: Uint8Array,
): Promise<Sealed> {
  const sealed = await aeadSeal(key, pad(payload), aad);
  if (sealed.ciphertext.length !== WALLET_BLOB_LEN) {
    throw new Error('sealPayload: blob length invariant violated');
  }
  return sealed;
}

/** Open a sealed payload. Returns `null` on any auth/format failure (= "no match"). */
export async function openPayload(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Promise<string | null> {
  const pt = await aeadOpen(key, nonce, ciphertext, aad);
  if (pt === null) return null;
  return unpad(pt);
}

/** A uniformly random blob shaped exactly like a real sealed payload. */
export function dummyBlob(): Sealed {
  return { nonce: randomBytes(NONCE_LEN), ciphertext: randomBytes(WALLET_BLOB_LEN) };
}
