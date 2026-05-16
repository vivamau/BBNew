import { VOPRFServer, deriveKeyPair } from '@cloudflare/voprf-ts';
import { utf8 } from '@bbnew/shared';
import { SUITE, MODE } from './suite.js';
import { deserializeEvalRequest, serializeEvaluation } from './serialization.js';

interface VersionKeys {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  server: VOPRFServer;
}

/**
 * Owns a member's OPRF keys across versions.
 *
 * Keys are derived deterministically from a per-member master seed plus a
 * version-specific `info` label, so a key version is fully reproducible from
 * `(masterSeed, version)` and only the master seed is persisted. Rotating to
 * `version+1` yields an unrelated key, which is what makes old pseudonyms
 * unresolvable once the old version is retired.
 */
export class OprfKeyManager {
  private readonly cache = new Map<number, VersionKeys>();

  constructor(private readonly masterSeed: Uint8Array) {
    if (masterSeed.length < 32) {
      throw new Error('OprfKeyManager: master seed must be >= 32 bytes');
    }
  }

  private async ensure(version: number): Promise<VersionKeys> {
    const cached = this.cache.get(version);
    if (cached) return cached;
    const info = utf8(`BBNew/oprf/v${version}`);
    const { privateKey, publicKey } = await deriveKeyPair(
      MODE,
      SUITE,
      this.masterSeed,
      info,
    );
    const vk: VersionKeys = {
      privateKey,
      publicKey,
      server: new VOPRFServer(SUITE, privateKey),
    };
    this.cache.set(version, vk);
    return vk;
  }

  async publicKey(version: number): Promise<Uint8Array> {
    return (await this.ensure(version)).publicKey;
  }

  /**
   * Server-side direct PRF. The returned value is byte-identical to what an
   * oblivious client finalizes for the same input under the same key version —
   * that equality is the entire basis of cross-member lookup.
   */
  async evaluate(input: Uint8Array, version: number): Promise<Uint8Array> {
    const { server } = await this.ensure(version);
    return server.evaluate(input);
  }

  /** Blind-evaluate a wire request, returning a serialized Evaluation (+ DLEQ proof). */
  async blindEvaluateB64(evaluationRequestB64: string, version: number): Promise<string> {
    const { server } = await this.ensure(version);
    const req = deserializeEvalRequest(evaluationRequestB64);
    const evaluation = await server.blindEvaluate(req);
    return serializeEvaluation(evaluation);
  }
}
