/**
 * HKDF-SHA256 over the Web Crypto API (built into Node >= 20, zero dependencies).
 * Used to derive the lookup tag and the wallet-wrapping key from a raw OPRF output.
 */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  lengthBytes: number,
): Promise<Uint8Array> {
  if (ikm.length === 0) {
    throw new Error('hkdfSha256: ikm must be non-empty');
  }
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}
