import { useState, useEffect, useCallback } from 'react';
import {
  getNetworkStatus,
  getLedgerSnapshot,
  getActivity,
  rotateMemberKey,
  reconcileMember,
  type NetworkStatus,
  type LedgerSnapshot,
  type ActivityRow,
} from '../api.ts';

interface Toast { msg: string; kind: 'success' | 'error' }

function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback((msg: string, kind: Toast['kind'] = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, show };
}

interface MemberCardProps {
  memberId: string;
  activeKeyVersion: number;
  answerableVersions: number[];
  suite: string;
  onRotate: () => Promise<void>;
  onReconcile: () => Promise<void>;
}

function MemberCard({ memberId, activeKeyVersion, answerableVersions, suite, onRotate, onReconcile }: MemberCardProps) {
  const [rotLoading, setRotLoading] = useState(false);
  const [recLoading, setRecLoading] = useState(false);

  const handleRotate = async () => {
    setRotLoading(true);
    try { await onRotate(); } finally { setRotLoading(false); }
  };

  const handleReconcile = async () => {
    setRecLoading(true);
    try { await onReconcile(); } finally { setRecLoading(false); }
  };

  return (
    <div className="card member-card">
      <div className="member-id">{memberId}</div>
      <div style={{ marginBottom: '0.75rem' }}>
        <span className="badge badge-gray">{suite}</span>
      </div>
      <div className="member-row">
        <span style={{ color: 'var(--text-muted)' }}>Active key version</span>
        <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>v{activeKeyVersion}</span>
      </div>
      <div className="member-row">
        <span style={{ color: 'var(--text-muted)' }}>Answerable versions</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {answerableVersions.map(v => `v${v}`).join(', ')}
        </span>
      </div>
      <div className="member-actions">
        <button className="btn btn-warning btn-sm" disabled={rotLoading} onClick={handleRotate}>
          {rotLoading ? '…' : '↻ Rotate key'}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={recLoading} onClick={handleReconcile}>
          {recLoading ? '…' : '⇄ Reconcile'}
        </button>
      </div>
    </div>
  );
}

interface DuplicateRow { idRaw: string; wallets: string[]; members: string[] }

function findDuplicates(rows: ActivityRow[]): DuplicateRow[] {
  const byId = new Map<string, { wallets: Set<string>; members: Set<string> }>();
  for (const row of rows) {
    const existing = byId.get(row.beneficiary_id_raw) ?? { wallets: new Set(), members: new Set() };
    existing.wallets.add(row.wallet);
    existing.members.add(row.member_id);
    byId.set(row.beneficiary_id_raw, existing);
  }
  return [...byId.entries()]
    .filter(([, v]) => v.wallets.size > 1)
    .map(([idRaw, v]) => ({
      idRaw,
      wallets: [...v.wallets],
      members: [...v.members],
    }));
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function MembersPage() {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const { toast, show: showToast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const [s, snap, act] = await Promise.all([
        getNetworkStatus(),
        getLedgerSnapshot(),
        getActivity(),
      ]);
      setStatus(s);
      setSnapshot(snap);
      setActivity(act);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleRotate = async (memberId: string) => {
    try {
      const res = await rotateMemberKey(memberId);
      if ('error' in res) { showToast(res.error, 'error'); return; }
      showToast(`${memberId} rotated to key v${res.activeKeyVersion}`);
      await refresh();
    } catch (e) { showToast(String(e), 'error'); }
  };

  const handleReconcile = async (memberId: string) => {
    try {
      const res = await reconcileMember(memberId);
      if ('error' in res) { showToast(res.error, 'error'); return; }
      showToast(`${memberId} reconciled — ${res.merges} merge(s)`);
      await refresh();
    } catch (e) { showToast(String(e), 'error'); }
  };

  const duplicates = findDuplicates(activity);

  return (
    <div>
      <div className="page-header">
        <h2>Members</h2>
        <p>Manage the three simulated network members, rotate keys, and detect wallet duplicates.</p>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {/* Member cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        {status
          ? status.members.map(m => (
              <MemberCard
                key={m.memberId}
                memberId={m.memberId}
                activeKeyVersion={m.activeKeyVersion}
                answerableVersions={m.answerableVersions}
                suite={m.suite}
                onRotate={() => handleRotate(m.memberId)}
                onReconcile={() => handleReconcile(m.memberId)}
              />
            ))
          : ['M1', 'M2', 'M3'].map(id => (
              <div key={id} className="card">
                <div className="member-id">{id}</div>
                <div className="empty-state" style={{ paddingTop: '0.5rem' }}>Loading…</div>
              </div>
            ))}
      </div>

      {/* Ledger stats */}
      {snapshot && (
        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <div className="stat-box">
              <div className="stat-value">{snapshot.activeWalletCount}</div>
              <div className="stat-label">Active wallets</div>
            </div>
          </div>
          <div className="card">
            <div className="stat-box">
              <div className="stat-value">
                {snapshot.wallets.reduce((s, w) => s + w.balance, 0).toLocaleString()}
              </div>
              <div className="stat-label">Total units</div>
            </div>
          </div>
          <div className="card">
            <div className="stat-box">
              <div className="stat-value">{snapshot.height}</div>
              <div className="stat-label">Block height</div>
            </div>
          </div>
        </div>
      )}

      {/* Key rotation explainer */}
      <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
        <strong>Key rotation</strong> derives a new OPRF keypair from the master seed (no PII stored), rebuilds
        the local pseudonym table, and retires the old version after a grace window. Old tags become
        permanently unresolvable — bounding cross-member linkage — while dedup is preserved under the new key.
      </div>

      {/* Duplicate detection */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Duplicate detection</div>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>↻ Refresh</button>
        </div>
        {duplicates.length === 0 ? (
          <div className="alert alert-success" style={{ margin: 0 }}>
            ✓ No duplicates detected — all beneficiaries have exactly one wallet across members.
          </div>
        ) : (
          <>
            <div className="alert alert-warning" style={{ marginBottom: '0.875rem' }}>
              {duplicates.length} beneficiar{duplicates.length === 1 ? 'y has' : 'ies have'} more than one
              wallet. Run Reconcile on each affected member to merge them.
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Beneficiary ID (raw)</th>
                  <th>Members</th>
                  <th>Wallets</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((d) => (
                  <tr key={d.idRaw}>
                    <td style={{ color: 'var(--text-bright)', fontWeight: 500 }}>{d.idRaw}</td>
                    <td>{d.members.join(', ')}</td>
                    <td>
                      {d.wallets.map(w => (
                        <div key={w} className="mono">{shortAddr(w)}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'alert-error' : 'alert-success'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
