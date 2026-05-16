import Fastify from 'fastify';
import cors from '@fastify/cors';
import { db, logActivity, listActivity } from './db.js';
import { startNetwork, MEMBER_IDS } from './network.js';

const PORT = 3001;

console.log('Starting BBNew member network…');
const net = await startNetwork();
console.log('Network ready. Starting BFF…');

const app = Fastify({ logger: { level: 'warn' } });
await app.register(cors, { origin: true });

// ── Network status ────────────────────────────────────────────────────────────

app.get('/api/network/status', async () => {
  const members = await Promise.all(
    MEMBER_IDS.map(async (id) => {
      const meta = (await fetch(`${net.members[id]!.baseUrl}/meta`).then((r) =>
        r.json(),
      )) as Record<string, unknown>;
      return { ...meta, memberId: id, baseUrl: net.members[id]!.baseUrl };
    }),
  );
  const snap = net.ledger.snapshot();
  return {
    members,
    ledger: { activeWalletCount: snap.activeWalletCount, height: snap.height },
  };
});

// ── Ledger ────────────────────────────────────────────────────────────────────

app.get('/api/ledger/snapshot', () => net.ledger.snapshot());

app.get<{ Params: { wallet: string } }>(
  '/api/ledger/balance/:wallet',
  (req) => {
    try {
      const { wallet } = req.params;
      return {
        wallet,
        balance: net.ledger.getBalance(wallet),
        isActive: net.ledger.isActive(wallet),
      };
    } catch {
      return { error: 'Wallet not found' };
    }
  },
);

// ── Onboard ───────────────────────────────────────────────────────────────────

interface OnboardBody {
  memberId: string;
  idRaw: string;
  scheme: string;
  amount: number;
}

app.post<{ Body: OnboardBody }>('/api/onboard', async (req) => {
  const { memberId, idRaw, scheme, amount } = req.body;
  const member = net.members[memberId];
  if (!member) return { error: `Unknown member: ${memberId}` };

  const result = (await fetch(`${member.baseUrl}/onboard`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idRaw, scheme, amount }),
  }).then((r) => r.json())) as { wallet: string; adopted: boolean; ownerMemberId: string };

  logActivity({
    beneficiary_id_raw: idRaw,
    scheme,
    member_id: memberId,
    wallet: result.wallet,
    owner_member_id: result.ownerMemberId,
    adopted: result.adopted ? 1 : 0,
    amount,
  });

  return result;
});

// ── Activity ──────────────────────────────────────────────────────────────────

app.get('/api/activity', () => listActivity());

// ── Admin ─────────────────────────────────────────────────────────────────────

app.post<{ Params: { memberId: string } }>('/api/admin/:memberId/rotate', async (req) => {
  const { memberId } = req.params;
  const member = net.members[memberId];
  if (!member) return { error: `Unknown member: ${memberId}` };
  return fetch(`${member.baseUrl}/admin/rotate`, { method: 'POST' }).then((r) => r.json());
});

app.post<{ Params: { memberId: string } }>('/api/admin/:memberId/reconcile', async (req) => {
  const { memberId } = req.params;
  const member = net.members[memberId];
  if (!member) return { error: `Unknown member: ${memberId}` };
  return fetch(`${member.baseUrl}/admin/reconcile`, { method: 'POST' }).then((r) => r.json());
});

// ── Dev ───────────────────────────────────────────────────────────────────────

app.post('/api/dev/reset-activity', () => {
  db.exec('DELETE FROM activity');
  return { ok: true };
});

// ── Listen ────────────────────────────────────────────────────────────────────

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`BFF ready → http://127.0.0.1:${PORT}`);
