import { hkdfSha256 } from './crypto/hkdf.js';
import { utf8 } from './bytes.js';

/**
 * Second-stage derivations from a raw OPRF output `raw = OPRF(k_M^v, normalize(id))`.
 *
 * - The lookup TAG is what a querier sends back to the responder: opaque, 16 bytes,
 *   not the raw OPRF output, and version-salted so a tag captured under version `v`
 *   is meaningless once `v` is retired (key-rotation linkage bound).
 * - The wallet KEY wraps the wallet address; only a party that independently holds
 *   `raw` (i.e. ran the oblivious protocol for the same id) can derive it.
 */

export const TAG_LEN = 16;
export const ENC_KEY_LEN = 32;

export function deriveLookupTag(raw: Uint8Array, version: number): Promise<Uint8Array> {
  return hkdfSha256(raw, utf8(`BBNew/tag/v${version}`), utf8('lookup-key'), TAG_LEN);
}

export function deriveWalletKey(raw: Uint8Array, version: number): Promise<Uint8Array> {
  return hkdfSha256(raw, utf8(`BBNew/enc/v${version}`), utf8('wallet-wrap'), ENC_KEY_LEN);
}
