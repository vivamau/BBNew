import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLedgerSnapshot, getWalletBalance, type WalletState, type LedgerSnapshot } from '../api.ts';

function shortAddr(addr: string) {
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

function fmtBalance(b: number) {
  return b.toLocaleString();
}

interface BalancePanelProps {
  wallet: string;
}

function BalancePanel({ wallet }: BalancePanelProps) {
  const [result, setResult] = useState<{ balance: number; isActive: boolean } | { error: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    try {
      const res = await getWalletBalance(wallet.trim());
      setResult(res);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void check(); }, [check]);

  if (!wallet) return null;
  if (loading) return <div className="card"><div className="empty-state">Checking balance…</div></div>;
  if (!result) return null;

  if ('error' in result) {
    return <div className="alert alert-error">{result.error}</div>;
  }

  return (
    <div className="card" style={{ marginBottom: '1.25rem', borderColor: result.isActive ? 'var(--accent2)' : 'var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Wallet address</div>
          <div className="mono" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>{wallet}</div>
        </div>
        {result.isActive
          ? <span className="badge badge-green">Active</span>
          : <span className="badge badge-orange">Merged</span>}
      </div>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '2rem' }}>
        <div className="stat-box" style={{ padding: 0 }}>
          <div className="stat-value" style={{ fontSize: '2rem', color: 'var(--accent2)' }}>
            {fmtBalance(result.balance)}
          </div>
          <div className="stat-label">Units</div>
        </div>
      </div>
    </div>
  );
}

interface SnapshotTableProps {
  snapshot: LedgerSnapshot;
  onSelect: (addr: string) => void;
}

function SnapshotTable({ snapshot, onSelect }: SnapshotTableProps) {
  const sorted = [...snapshot.wallets].sort((a, b) => b.balance - a.balance);
  const totalBalance = snapshot.wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <>
      <div className="grid-3" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <div className="stat-box">
            <div className="stat-value">{snapshot.activeWalletCount}</div>
            <div className="stat-label">Active wallets</div>
          </div>
        </div>
        <div className="card">
          <div className="stat-box">
            <div className="stat-value">{fmtBalance(totalBalance)}</div>
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

      <div className="card">
        <div className="card-title">All wallets</div>
        {sorted.length === 0 ? (
          <div className="empty-state">No wallets yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Merged into</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w: WalletState) => (
                <tr key={w.address} style={{ cursor: 'pointer' }} onClick={() => onSelect(w.address)}>
                  <td>
                    <span className="mono" title={w.address}>{shortAddr(w.address)}</span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{fmtBalance(w.balance)}</td>
                  <td>
                    {w.mergedInto
                      ? <span className="badge badge-orange">Merged</span>
                      : <span className="badge badge-green">Active</span>}
                  </td>
                  <td>
                    {w.mergedInto
                      ? <span className="mono" title={w.mergedInto}>{shortAddr(w.mergedInto)}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function WalletPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('wallet') ?? '');
  const [checkedWallet, setCheckedWallet] = useState(searchParams.get('wallet') ?? '');
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [snapshotErr, setSnapshotErr] = useState<string | null>(null);

  useEffect(() => {
    getLedgerSnapshot()
      .then(setSnapshot)
      .catch((e: unknown) => setSnapshotErr(String(e)));
  }, []);

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = input.trim();
    setCheckedWallet(addr);
    setSearchParams(addr ? { wallet: addr } : {});
  };

  const handleSelect = (addr: string) => {
    setInput(addr);
    setCheckedWallet(addr);
    setSearchParams({ wallet: addr });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="page-header">
        <h2>Wallets</h2>
        <p>Check a wallet balance or browse all wallets on the simulated chain.</p>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">Balance checker</div>
        <form onSubmit={handleCheck} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="form-input"
            placeholder="0x…  paste a wallet address"
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}
          />
          <button className="btn btn-primary" type="submit" style={{ flexShrink: 0 }}>
            Check
          </button>
        </form>
      </div>

      {checkedWallet && <BalancePanel wallet={checkedWallet} />}

      {snapshotErr && <div className="alert alert-error">{snapshotErr}</div>}

      {snapshot ? (
        <SnapshotTable snapshot={snapshot} onSelect={handleSelect} />
      ) : (
        !snapshotErr && <div className="empty-state">Loading chain state…</div>
      )}
    </div>
  );
}
