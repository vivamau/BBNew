import { describe, it, expect, afterEach } from 'vitest';
import { Ledger } from '@bbnew/ledger';
import {
  createMemberServer,
  crossMemberQuery,
  type RunningMember,
} from '@bbnew/member';
import { OprfSession } from '@bbnew/voprf';
import {
  wireAudit,
  utf8,
  toB64,
  fromB64,
  toHex,
  deriveLookupTag,
  deriveWalletKey,
  openPayload,
  WALLET_BLOB_LEN,
  NONCE_LEN,
  type WireRecord,
} from '@bbnew/shared';

async function makeNetwork(ids: string[], opts: { mutexEnabled?: boolean } = {}) {
  const ledger = new Ledger();
  const members: Record<string, RunningMember> = {};
  for (const id of ids) {
    members[id] = await createMemberServer(
      { memberId: id, ledger, mutexEnabled: opts.mutexEnabled ?? true },
      0,
    );
  }
  for (const id of ids) {
    members[id]!.setPeers(
      ids.filter((x) => x !== id).map((x) => ({ memberId: x, baseUrl: members[x]!.baseUrl })),
    );
  }
  return {
    ledger,
    members,
    close: async () => {
      await Promise.all(Object.values(members).map((m) => m.close()));
    },
  };
}

const onboard = async (base: string, idRaw: string, scheme: string, amount: number) =>
  (await (
    await fetch(`${base}/onboard`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idRaw, scheme, amount }),
    })
  ).json()) as { wallet: string; adopted: boolean; ownerMemberId: string };

const adminPost = (base: string, path: string) => fetch(`${base}${path}`, { method: 'POST' });

let net: Awaited<ReturnType<typeof makeNetwork>> | undefined;
afterEach(async () => {
  await net?.close();
  net = undefined;
  wireAudit.setEnabled(false);
  wireAudit.clear();
});

describe('cross-member deduplication', () => {
  it('the same person resolves to ONE wallet across all members', async () => {
    net = await makeNetwork(['M1', 'M2', 'M3']);
    const { M1, M2, M3 } = net.members;
    const a = await onboard(M1!.baseUrl, 'REF/2024/1', 'UNHCR', 100);
    expect(a.adopted).toBe(false);
    const b = await onboard(M2!.baseUrl, 'ref-2024-1', 'UNHCR', 50);
    const c = await onboard(M3!.baseUrl, 'REF 2024 1', 'UNHCR', 25);
    expect(b.wallet).toBe(a.wallet);
    expect(c.wallet).toBe(a.wallet);
    expect(b.adopted && c.adopted).toBe(true);
    expect(b.ownerMemberId).toBe('M1');
    expect(net.ledger.snapshot().activeWalletCount).toBe(1);
    expect(net.ledger.getBalance(a.wallet)).toBe(175);
  });

  it('different people get different wallets', async () => {
    net = await makeNetwork(['M1', 'M2']);
    const a = await onboard(net.members.M1!.baseUrl, '111', 'NID', 10);
    const b = await onboard(net.members.M2!.baseUrl, '222', 'NID', 10);
    expect(a.wallet).not.toBe(b.wallet);
    expect(net.ledger.snapshot().activeWalletCount).toBe(2);
  });
});

describe('key rotation', () => {
  it('retires old pseudonyms but still resolves the same wallet', async () => {
    net = await makeNetwork(['M1', 'M2']);
    const M1 = net.members.M1!;
    const a = await onboard(M1.baseUrl, 'ROT-1', 'TAX', 100);

    // Capture a pre-rotation tag exactly as a querier would.
    const norm = 'TAX:ROT1';
    const meta0 = (await (await fetch(`${M1.baseUrl}/meta`)).json()) as {
      activeKeyVersion: number;
      activePublicKeyB64: string;
    };
    expect(meta0.activeKeyVersion).toBe(0);
    const s0 = await OprfSession.blind(fromB64(meta0.activePublicKeyB64), utf8(norm));
    const e0 = (await (
      await fetch(`${M1.baseUrl}/oprf/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyVersion: 0, evaluationRequestB64: s0.evaluationRequestB64 }),
      })
    ).json()) as { evaluationB64: string };
    const raw0 = await s0.finalizeAndVerify(e0.evaluationB64);
    const tag0 = await deriveLookupTag(raw0, 0);
    const enc0 = await deriveWalletKey(raw0, 0);

    // Pre-rotation: the old tag resolves.
    const lookPre = (await (
      await fetch(`${M1.baseUrl}/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyVersion: 0, tagB64: toB64(tag0) }),
      })
    ).json()) as { nonceB64: string; blobB64: string };
    const aad0 = utf8(`BBNew|0|${toHex(tag0)}`);
    expect(
      await openPayload(enc0, fromB64(lookPre.nonceB64), fromB64(lookPre.blobB64), aad0),
    ).not.toBeNull();

    // Two rotations ⇒ v0 retired.
    await adminPost(M1.baseUrl, '/admin/rotate');
    await adminPost(M1.baseUrl, '/admin/rotate');

    const evalRetired = await fetch(`${M1.baseUrl}/oprf/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyVersion: 0, evaluationRequestB64: 'AA==' }),
    });
    expect(evalRetired.status).toBe(409);

    // The OLD tag now misses (response is an indistinguishable dummy).
    const lookPost = (await (
      await fetch(`${M1.baseUrl}/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyVersion: 0, tagB64: toB64(tag0) }),
      })
    ).json()) as { nonceB64: string; blobB64: string };
    expect(fromB64(lookPost.blobB64).length).toBe(WALLET_BLOB_LEN);
    expect(
      await openPayload(enc0, fromB64(lookPost.nonceB64), fromB64(lookPost.blobB64), aad0),
    ).toBeNull();

    // But dedup is preserved under the active key.
    const after = await crossMemberQuery(
      'M2',
      { memberId: 'M1', baseUrl: M1.baseUrl },
      norm,
    );
    expect(after?.wallet).toBe(a.wallet);
  });
});

describe('negative lookup leaks nothing', () => {
  it('an unknown person yields null and only fixed-length blobs on the wire', async () => {
    wireAudit.setEnabled(true);
    wireAudit.clear();
    net = await makeNetwork(['M1', 'M2']);
    const hit = await crossMemberQuery(
      'M2',
      { memberId: 'M1', baseUrl: net.members.M1!.baseUrl },
      'NID:DOES-NOT-EXIST',
    );
    expect(hit).toBeNull();
    const lookups = wireAudit.select(
      (r: WireRecord) =>
        r.path === '/lookup' &&
        !!r.body &&
        typeof r.body === 'object' &&
        'blobB64' in (r.body as object),
    );
    expect(lookups.length).toBeGreaterThan(0);
    for (const r of lookups) {
      const b = r.body as { nonceB64: string; blobB64: string };
      expect(fromB64(b.blobB64).length).toBe(WALLET_BLOB_LEN);
      expect(fromB64(b.nonceB64).length).toBe(NONCE_LEN);
    }
    wireAudit.assertNoneLeaked(['NID:DOESNOTEXIST', 'NID:DOES-NOT-EXIST']);
  });
});

describe('concurrent onboarding (mutex OFF) reconciliation', () => {
  it('converges to a single wallet via deterministic owner + mergeWallets', async () => {
    net = await makeNetwork(['A1', 'A2', 'A3'], { mutexEnabled: false });
    const [z2, z3] = await Promise.all([
      onboard(net.members.A2!.baseUrl, 'ZZ-9', 'TAX', 50),
      onboard(net.members.A3!.baseUrl, 'ZZ-9', 'TAX', 50),
    ]);
    for (const id of ['A1', 'A2', 'A3']) {
      await adminPost(net.members[id]!.baseUrl, '/admin/reconcile');
    }
    expect(net.ledger.snapshot().activeWalletCount).toBe(1);
    // getBalance resolves the merge chain, so either handle returns the total.
    expect(net.ledger.getBalance(z2.wallet)).toBe(100);
    expect(net.ledger.getBalance(z3.wallet)).toBe(100);
  });
});

describe('wire audit (cross-cutting)', () => {
  it('no raw/normalized id or cleartext wallet crosses between members', async () => {
    wireAudit.setEnabled(true);
    wireAudit.clear();
    net = await makeNetwork(['M1', 'M2', 'M3']);
    const a = await onboard(net.members.M1!.baseUrl, 'AUDIT/77', 'UNHCR', 100);
    await onboard(net.members.M2!.baseUrl, 'audit-77', 'UNHCR', 5);

    const memberIds = new Set(['M1', 'M2', 'M3']);
    const crossPred = (r: WireRecord) =>
      ['/meta', '/oprf/evaluate', '/lookup'].includes(r.path) &&
      memberIds.has(r.from) &&
      memberIds.has(r.to);

    wireAudit.assertNoneLeaked(
      ['AUDIT/77', 'audit-77', 'UNHCR:AUDIT77', a.wallet],
      crossPred,
    );
    wireAudit.assertOnlyAllowedKeys(
      {
        '/meta': [
          'memberId',
          'suite',
          'activeKeyVersion',
          'activePublicKeyB64',
          'answerableVersions',
        ],
        '/oprf/evaluate': ['keyVersion', 'evaluationRequestB64', 'evaluationB64', 'error'],
        '/lookup': ['keyVersion', 'tagB64', 'nonceB64', 'blobB64'],
      },
      crossPred,
    );
    expect(wireAudit.select(crossPred).length).toBeGreaterThan(0);
  });
});
