import { describe, it, expect } from 'vitest';
import { OprfKeyManager, OprfSession } from '@bbnew/voprf';
import { randomBytes, utf8, toHex } from '@bbnew/shared';

describe('@bbnew/voprf', () => {
  it('oblivious finalize equals server-side evaluate for the same input/key', async () => {
    const km = new OprfKeyManager(randomBytes(32));
    const v = 0;
    const msg = utf8('UNHCR:ABC123');

    const serverSide = await km.evaluate(msg, v);

    const session = await OprfSession.blind(await km.publicKey(v), msg);
    const evalB64 = await km.blindEvaluateB64(session.evaluationRequestB64, v);
    const clientSide = await session.finalizeAndVerify(evalB64);

    expect(toHex(clientSide)).toBe(toHex(serverSide));
  });

  it('different inputs produce different outputs; same input is stable', async () => {
    const km = new OprfKeyManager(randomBytes(32));
    const a1 = await km.evaluate(utf8('NID:1'), 0);
    const a2 = await km.evaluate(utf8('NID:1'), 0);
    const b = await km.evaluate(utf8('NID:2'), 0);
    expect(toHex(a1)).toBe(toHex(a2));
    expect(toHex(a1)).not.toBe(toHex(b));
  });

  it('a different key version yields an unrelated pseudonym (rotation)', async () => {
    const km = new OprfKeyManager(randomBytes(32));
    const v0 = await km.evaluate(utf8('TAX:42'), 0);
    const v1 = await km.evaluate(utf8('TAX:42'), 1);
    expect(toHex(v0)).not.toBe(toHex(v1));
  });

  it('finalize throws when the DLEQ proof does not match the advertised key', async () => {
    const honest = new OprfKeyManager(randomBytes(32));
    const attacker = new OprfKeyManager(randomBytes(32));
    const msg = utf8('NID:DLEQ');

    // Client blinds against the HONEST public key...
    const session = await OprfSession.blind(await honest.publicKey(0), msg);
    // ...but a malicious responder evaluates with a DIFFERENT key.
    const forged = await attacker.blindEvaluateB64(session.evaluationRequestB64, 0);

    await expect(session.finalizeAndVerify(forged)).rejects.toThrow();
  });
});
