import {
  utf8,
  toB64,
  fromB64,
  toHex,
  deriveLookupTag,
  deriveWalletKey,
  openPayload,
  MetaResponse,
  OprfEvaluateResponse,
  LookupResponse,
  wireAudit,
} from '@bbnew/shared';
import { OprfSession } from '@bbnew/voprf';

export interface PeerRef {
  memberId: string;
  baseUrl: string;
}

export interface QueryHit {
  wallet: string;
  ownerMemberId: string;
}

async function getJson(
  selfId: string,
  peer: PeerRef,
  path: string,
): Promise<{ status: number; json: unknown }> {
  wireAudit.record({ dir: 'out', from: selfId, to: peer.memberId, method: 'GET', path, body: null, at: Date.now() });
  const res = await fetch(`${peer.baseUrl}${path}`, {
    headers: { 'x-bbnew-member': selfId },
  });
  const json = await res.json();
  wireAudit.record({ dir: 'in', from: peer.memberId, to: selfId, method: 'GET', path, body: json, at: Date.now() });
  return { status: res.status, json };
}

async function postJson(
  selfId: string,
  peer: PeerRef,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  wireAudit.record({ dir: 'out', from: selfId, to: peer.memberId, method: 'POST', path, body, at: Date.now() });
  const res = await fetch(`${peer.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bbnew-member': selfId },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  wireAudit.record({ dir: 'in', from: peer.memberId, to: selfId, method: 'POST', path, body: json, at: Date.now() });
  return { status: res.status, json };
}

async function probe(
  selfId: string,
  peer: PeerRef,
  raw: Uint8Array,
  version: number,
): Promise<QueryHit | null> {
  const tag = await deriveLookupTag(raw, version);
  const tagHex = toHex(tag);
  const encKey = await deriveWalletKey(raw, version);
  const res = await postJson(selfId, peer, '/lookup', {
    keyVersion: version,
    tagB64: toB64(tag),
  });
  if (res.status !== 200) return null;
  const { nonceB64, blobB64 } = LookupResponse.parse(res.json);
  const aad = utf8(`BBNew|${version}|${tagHex}`);
  const payload = await openPayload(encKey, fromB64(nonceB64), fromB64(blobB64), aad);
  if (payload === null) return null; // AEAD tag mismatch ⇒ "peer has no wallet"
  try {
    const parsed = JSON.parse(payload) as { o: string; w: string };
    if (typeof parsed.o !== 'string' || typeof parsed.w !== 'string') return null;
    return { ownerMemberId: parsed.o, wallet: parsed.w };
  } catch {
    return null;
  }
}

/**
 * The full single-element private query against one peer:
 * blind → oblivious evaluate (DLEQ-verified) → derive tag locally →
 * match-oblivious lookup → decrypt-or-nothing.
 *
 * Throws only on a DLEQ verification failure (a security signal the caller
 * must decide how to treat); a clean "peer has no wallet" returns `null`.
 */
export async function crossMemberQuery(
  selfId: string,
  peer: PeerRef,
  idNormalized: string,
): Promise<QueryHit | null> {
  const meta1 = MetaResponse.parse((await getJson(selfId, peer, '/meta')).json);
  const attempt = async (
    m: MetaResponse,
  ): Promise<{ retry: boolean; hit: QueryHit | null }> => {
    const session = await OprfSession.blind(
      fromB64(m.activePublicKeyB64),
      utf8(idNormalized),
    );
    const res = await postJson(selfId, peer, '/oprf/evaluate', {
      keyVersion: m.activeKeyVersion,
      evaluationRequestB64: session.evaluationRequestB64,
    });
    if (res.status === 409) return { retry: true, hit: null }; // peer rotated mid-flight
    if (res.status !== 200) return { retry: false, hit: null };
    const raw = await session.finalizeAndVerify(
      OprfEvaluateResponse.parse(res.json).evaluationB64,
    );
    return { retry: false, hit: await probe(selfId, peer, raw, m.activeKeyVersion) };
  };

  const first = await attempt(meta1);
  if (!first.retry) return first.hit;
  const meta2 = MetaResponse.parse((await getJson(selfId, peer, '/meta')).json);
  return (await attempt(meta2)).hit;
}
