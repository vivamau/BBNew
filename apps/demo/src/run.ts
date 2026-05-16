import {
  wireAudit,
  fromB64,
  WALLET_BLOB_LEN,
  NONCE_LEN,
  type WireRecord,
} from '@bbnew/shared';
import { crossMemberQuery } from '@bbnew/member';
import { startNetwork, isCrossMemberTraffic } from './scenario.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}
const h = (s: string) => console.log(`\n=== ${s} ===`);
const log = (s: string) => console.log(`  ${s}`);

interface OnboardRes {
  wallet: string;
  adopted: boolean;
  ownerMemberId: string;
  keyVersion: number;
}

async function onboard(
  base: string,
  idRaw: string,
  scheme: string,
  amount: number,
): Promise<OnboardRes> {
  const r = await fetch(`${base}/onboard`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idRaw, scheme, amount }),
  });
  return (await r.json()) as OnboardRes;
}
const post = (base: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });

async function main(): Promise<void> {
  wireAudit.setEnabled(true);
  wireAudit.clear();

  const memberIds = ['M1', 'M2', 'M3'];
  const net = await startNetwork(memberIds);
  const { M1, M2, M3 } = net.members;

  // Beneficiary X — same person, DIFFERENT raw formatting at each member.
  const X_RAW = ['REF/2024/0099', 'ref-2024-0099', 'Ref 2024 0099'];
  const SCHEME = 'UNHCR';

  try {
    h('1. M1 onboards a NEW beneficiary X → a wallet is minted');
    const a1 = await onboard(M1!.baseUrl, X_RAW[0]!, SCHEME, 100);
    log(`M1: wallet=${a1.wallet} adopted=${a1.adopted} owner=${a1.ownerMemberId}`);
    assert(!a1.adopted, 'first onboarding must mint, not adopt');
    const W = a1.wallet;

    h('2. M2 onboards the SAME person (different ID formatting) → adopts W');
    const a2 = await onboard(M2!.baseUrl, X_RAW[1]!, SCHEME, 50);
    log(`M2: wallet=${a2.wallet} adopted=${a2.adopted} owner=${a2.ownerMemberId}`);
    assert(a2.adopted, 'M2 must adopt the existing wallet');
    assert(a2.wallet === W, 'M2 must resolve to the SAME wallet as M1');

    h('3. M3 onboards the SAME person → also resolves W');
    const a3 = await onboard(M3!.baseUrl, X_RAW[2]!, SCHEME, 25);
    log(`M3: wallet=${a3.wallet} adopted=${a3.adopted} owner=${a3.ownerMemberId}`);
    assert(a3.wallet === W, 'M3 must resolve to the SAME wallet as M1');

    const snap = net.ledger.snapshot();
    log(
      `Ledger: activeWallets=${snap.activeWalletCount} balance(W)=${net.ledger.getBalance(W)} (expected 175)`,
    );
    assert(net.ledger.getBalance(W) === 175, 'all assistance lands on the one wallet');
    assert(snap.activeWalletCount === 1, 'exactly ONE wallet exists for X');

    h('4. M2 onboards a DIFFERENT new person Y → a distinct wallet');
    const ay = await onboard(M2!.baseUrl, '99-AB-77', 'NID', 40);
    log(`M2: wallet=${ay.wallet} adopted=${ay.adopted}`);
    assert(ay.wallet !== W, 'a different person must get a different wallet');
    assert(net.ledger.snapshot().activeWalletCount === 2, 'now two distinct wallets');

    h('5. Key rotation on M1 invalidates old pseudonyms but preserves dedup');
    const m1ref = { memberId: 'M1', baseUrl: M1!.baseUrl };
    const before = await crossMemberQuery('OPERATOR', m1ref, `${SCHEME}:REF20240099`);
    log(`cross-query M1 (pre-rotation): wallet=${before?.wallet ?? 'none'}`);
    assert(before?.wallet === W, 'M1 resolves X before rotation');

    await post(M1!.baseUrl, '/admin/rotate'); // v0 -> grace, v1 active
    await post(M1!.baseUrl, '/admin/rotate'); // v0 -> RETIRED, v1 grace, v2 active
    const oldVersionProbe = await post(M1!.baseUrl, '/oprf/evaluate', {
      keyVersion: 0,
      evaluationRequestB64: 'AA==',
    });
    log(`/oprf/evaluate keyVersion=0 after 2 rotations → HTTP ${oldVersionProbe.status}`);
    assert(oldVersionProbe.status === 409, 'retired key version must be unanswerable');

    const after = await crossMemberQuery('OPERATOR', m1ref, `${SCHEME}:REF20240099`);
    log(`cross-query M1 (post-rotation): wallet=${after?.wallet ?? 'none'}`);
    assert(after?.wallet === W, 'dedup still resolves the SAME wallet after rotation');

    h('6. Concurrent onboarding of a brand-new person (mutex OFF) + reconcile');
    const net2 = await startNetwork(['A1', 'A2', 'A3'], { mutexEnabled: false });
    try {
      const [z2, z3] = await Promise.all([
        onboard(net2.members.A2!.baseUrl, 'Z-0001', 'TAX', 50),
        onboard(net2.members.A3!.baseUrl, 'Z-0001', 'TAX', 50),
      ]);
      const minted = net2.ledger.snapshot().activeWalletCount;
      log(`A2 wallet=${z2.wallet} | A3 wallet=${z3.wallet} | active=${minted}`);

      for (const id of ['A1', 'A2', 'A3']) {
        const r = await (await post(net2.members[id]!.baseUrl, '/admin/reconcile')).json();
        log(`reconcile(${id}): merges=${JSON.stringify((r as { merges: unknown[] }).merges)}`);
      }
      const finalActive = net2.ledger.snapshot().activeWalletCount;
      log(
        `after reconcile: activeWallets=${finalActive} balance=${net2.ledger.getBalance(z2.wallet)} (expected 100)`,
      );
      assert(finalActive === 1, 'reconciliation converges to exactly ONE wallet');
      assert(
        net2.ledger.getBalance(z2.wallet) === 100,
        'no assistance is lost in the merge',
      );
    } finally {
      await net2.close();
    }

    h('7. Wire audit — prove nothing sensitive crossed BETWEEN members');
    const crossPred = isCrossMemberTraffic(memberIds);
    const forbidden = [
      ...X_RAW,
      `${SCHEME}:REF20240099`,
      '99-AB-77',
      'NID:99AB77',
      W,
      ay.wallet,
    ];
    wireAudit.assertNoneLeaked(forbidden, crossPred);
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

    const lookups = wireAudit.select(
      (r: WireRecord) =>
        crossPred(r) &&
        r.path === '/lookup' &&
        !!r.body &&
        typeof r.body === 'object' &&
        'blobB64' in (r.body as object),
    );
    assert(lookups.length > 0, 'expected some /lookup responses to audit');
    for (const r of lookups) {
      const b = r.body as { nonceB64: string; blobB64: string };
      assert(
        fromB64(b.blobB64).length === WALLET_BLOB_LEN,
        'every lookup blob is the fixed length (match == non-match)',
      );
      assert(fromB64(b.nonceB64).length === NONCE_LEN, 'nonce length is fixed');
    }
    log(`audited ${lookups.length} lookup responses — all fixed-length, no PII, no cleartext wallet`);

    console.log('\nALL CHECKS PASSED ✔  (no PII or cleartext wallet ever crossed the member-to-member wire)');
  } finally {
    await net.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
