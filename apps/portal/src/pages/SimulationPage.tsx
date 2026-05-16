import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboard, getActivity, resetActivity, type ActivityRow, type OnboardResult } from '../api.ts';

const SCHEMES = ['UNHCR', 'NID', 'TAX', 'BIO'] as const;
const MEMBER_IDS = ['M1', 'M2', 'M3'] as const;

interface Scenario {
  title: string;
  subtitle: string;
  desc: string;
  expectedLabel: string;
  expectedClass: string;
  memberId: string;
  idRaw: string;
  scheme: string;
  amount: number;
}

const SCENARIOS: Scenario[] = [
  {
    title: 'Beneficiary A → Member M1',
    subtitle: 'REF/2024/001 · UNHCR · 100',
    desc: 'First registration across the network. M1 fans out, finds nothing, mints a fresh wallet.',
    expectedLabel: 'New wallet',
    expectedClass: 'badge-blue',
    memberId: 'M1', idRaw: 'REF/2024/001', scheme: 'UNHCR', amount: 100,
  },
  {
    title: 'Same Beneficiary A → Member M2',
    subtitle: 'ref-2024-001 · UNHCR · 50  (different raw format, same normalised id)',
    desc: 'M2 runs the VOPRF cross-query against M1 and adopts the existing wallet. No PII exchanged.',
    expectedLabel: 'Adopted',
    expectedClass: 'badge-green',
    memberId: 'M2', idRaw: 'ref-2024-001', scheme: 'UNHCR', amount: 50,
  },
  {
    title: 'Beneficiary B → Member M2',
    subtitle: 'NID-2024-999 · NID · 75',
    desc: 'A completely different person. No match at any member. M2 mints a second independent wallet.',
    expectedLabel: 'New wallet',
    expectedClass: 'badge-blue',
    memberId: 'M2', idRaw: 'NID-2024-999', scheme: 'NID', amount: 75,
  },
];

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString(); } catch { return ts; }
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

interface ResultCardProps { result: OnboardResult; onViewWallet: () => void }

function ResultCard({ result, onViewWallet }: ResultCardProps) {
  return (
    <div className="card">
      <div className="card-title">
        Latest result
        <span style={{ marginLeft: '0.5rem' }}>
          {result.adopted
            ? <span className="badge badge-green">Adopted existing wallet</span>
            : <span className="badge badge-blue">New wallet minted</span>}
        </span>
      </div>
      <div className="result-wallet">{result.wallet}</div>
      <div className="result-row">
        <span className="result-label">Owner member</span>
        <span className="result-value">{result.ownerMemberId}</span>
      </div>
      <div style={{ marginTop: '0.875rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={onViewWallet}>
          ◈ Check balance →
        </button>
      </div>
    </div>
  );
}

interface ActivityFeedProps { rows: ActivityRow[]; onReset: () => void }

function ActivityFeed({ rows, onReset }: ActivityFeedProps) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
        <span className="card-title" style={{ marginBottom: 0 }}>Activity log ({rows.length})</span>
        {rows.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={onReset}>Clear</button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">No activity yet — run a scenario above.</div>
      ) : (
        <div className="scroll-list">
          {rows.map((row) => (
            <div key={row.id} className="activity-item">
              <div className="activity-main">
                <div className="activity-id">
                  {row.beneficiary_id_raw}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {row.scheme} · {row.member_id}</span>
                </div>
                <div className="activity-meta">
                  <span className="activity-wallet">{shortAddr(row.wallet)}</span>
                  {row.owner_member_id !== row.member_id && (
                    <span style={{ marginLeft: '0.5rem' }}>owner: {row.owner_member_id}</span>
                  )}
                  <span style={{ marginLeft: '0.5rem' }}>{row.amount} units</span>
                </div>
                <div style={{ marginTop: '0.15rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmtTime(row.ts)}</div>
              </div>
              <div>
                {row.adopted
                  ? <span className="badge badge-green">Adopted</span>
                  : <span className="badge badge-blue">New</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SimulationPage() {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<OnboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const [memberId, setMemberId] = useState<string>('M1');
  const [idRaw, setIdRaw] = useState('');
  const [scheme, setScheme] = useState<string>('UNHCR');
  const [amount, setAmount] = useState<number>(100);

  const refreshActivity = useCallback(async () => {
    try {
      const rows = await getActivity();
      setActivity(rows);
      setActivityLoaded(true);
    } catch { /* ignore */ }
  }, []);

  const runOnboard = useCallback(async (params: { memberId: string; idRaw: string; scheme: string; amount: number }) => {
    setRunning(true);
    setError(null);
    try {
      const res = await onboard(params);
      if ('error' in res) {
        setError(res.error);
      } else {
        setLastResult(res);
        await refreshActivity();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [refreshActivity]);

  const handleScenario = useCallback((s: Scenario) => {
    setMemberId(s.memberId);
    setIdRaw(s.idRaw);
    setScheme(s.scheme);
    setAmount(s.amount);
    void runOnboard({ memberId: s.memberId, idRaw: s.idRaw, scheme: s.scheme, amount: s.amount });
  }, [runOnboard]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idRaw.trim()) return;
    void runOnboard({ memberId, idRaw: idRaw.trim(), scheme, amount });
  };

  const handleReset = async () => {
    await resetActivity();
    setActivity([]);
    setLastResult(null);
  };

  // Load activity on first render
  if (!activityLoaded) { void refreshActivity(); }

  return (
    <div>
      <div className="page-header">
        <h2>Simulation</h2>
        <p>Run guided scenarios to see cross-member wallet deduplication in action.</p>
      </div>

      <div className="sim-grid">
        {/* Left panel */}
        <div>
          <div className="card">
            <div className="card-title">Guided scenarios</div>
            <div className="card-subtitle">Click to auto-run. Each scenario builds on the previous.</div>
            {SCENARIOS.map((s, i) => (
              <div
                key={i}
                className={`scenario-card${running ? ' running' : ''}`}
                onClick={() => !running && handleScenario(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && !running && handleScenario(s)}
              >
                <div className="scenario-card-header">
                  <div>
                    <div className="scenario-card-title">
                      <span style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>#{i + 1}</span>
                      {s.title}
                    </div>
                    <div className="scenario-card-sub">{s.subtitle}</div>
                  </div>
                  <span className={`badge ${s.expectedClass}`}>{s.expectedLabel}</span>
                </div>
                <div className="scenario-card-desc">{s.desc}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">Custom registration</div>
            <form onSubmit={handleCustomSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Member</label>
                  <select className="form-select" value={memberId} onChange={e => setMemberId(e.target.value)}>
                    {MEMBER_IDS.map(id => <option key={id}>{id}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Scheme</label>
                  <select className="form-select" value={scheme} onChange={e => setScheme(e.target.value)}>
                    {SCHEMES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Beneficiary ID (raw)</label>
                <input
                  className="form-input"
                  placeholder="e.g. REF/2024/001 or ref-2024-001"
                  value={idRaw}
                  onChange={e => setIdRaw(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Assistance amount</label>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                />
              </div>
              <button
                className="btn btn-primary btn-full"
                type="submit"
                disabled={running || !idRaw.trim()}
              >
                {running ? 'Processing…' : 'Register & request assistance'}
              </button>
            </form>
          </div>
        </div>

        {/* Right panel */}
        <div>
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {lastResult && (
            <ResultCard
              result={lastResult}
              onViewWallet={() => navigate(`/wallets?wallet=${encodeURIComponent(lastResult.wallet)}`)}
            />
          )}

          {!lastResult && !error && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="empty-state">
                Run a scenario on the left to see the result here.
              </div>
            </div>
          )}

          <div style={{ marginTop: lastResult ? '1rem' : 0 }}>
            <ActivityFeed rows={activity} onReset={handleReset} />
          </div>
        </div>
      </div>
    </div>
  );
}
