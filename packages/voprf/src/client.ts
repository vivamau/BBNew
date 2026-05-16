import { VOPRFClient, type FinalizeData } from '@cloudflare/voprf-ts';
import { SUITE } from './suite.js';
import { serializeEvalRequest, deserializeEvaluation } from './serialization.js';

/**
 * Client side of the oblivious evaluation. A session pins one client instance
 * (bound to the responder's advertised public key) across blind → finalize so
 * the DLEQ verification in `finalize` is checked against that exact key.
 */
export class OprfSession {
  private constructor(
    private readonly client: VOPRFClient,
    private readonly finData: FinalizeData,
    readonly evaluationRequestB64: string,
  ) {}

  static async blind(publicKey: Uint8Array, message: Uint8Array): Promise<OprfSession> {
    const client = new VOPRFClient(SUITE, publicKey);
    const [finData, evalReq] = await client.blind([message]);
    return new OprfSession(client, finData, serializeEvalRequest(evalReq));
  }

  /**
   * Unblind + finalize. `VOPRFClient.finalize` verifies the DLEQ proof against
   * the public key this session was created with and THROWS if it fails — this
   * is the guarantee that a responder cannot use a per-query distinguishing key.
   */
  async finalizeAndVerify(evaluationB64: string): Promise<Uint8Array> {
    const evaluation = deserializeEvaluation(evaluationB64);
    const [output] = await this.client.finalize(this.finData, evaluation);
    if (!output) throw new Error('OprfSession: empty finalize output');
    return output;
  }
}
