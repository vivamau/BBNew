import { Oprf } from '@cloudflare/voprf-ts';

/**
 * Single switch point for the OPRF ciphersuite.
 *
 * P256-SHA256 is RFC 9497 conformant, uses Node's native WebCrypto (zero extra
 * deps), has published test vectors, and is more than enough for a simulation.
 * Swapping to `Oprf.Suite.RISTRETTO255_SHA512` (constant-time scalar ops via
 * @noble/curves) would be a one-line change here plus a crypto-provider import.
 */
export const SUITE = Oprf.Suite.P256_SHA256;

/** Verifiable mode: every evaluation carries a DLEQ proof bound to the public key. */
export const MODE = Oprf.Mode.VOPRF;
