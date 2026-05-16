import { useState, useEffect, useCallback } from 'react';
import {
  getLedgerSnapshot,
  getActivity,
  type LedgerSnapshot,
  type WalletState,
  type TxReceipt,
  type ActivityRow,
} from '../api.ts';

// ─── Theme constants ────────────────────────────────────────────────────────

const C = {
  M1: '#5b8af5',
  M2: '#7ed4a4',
  M3: '#f0a050',
  unknown: '#7880a0',
  txCreate: '#5b8af5',
  txLoad: '#7ed4a4',
  txRedeem: '#f0a050',
  txMerge: '#e06070',
  surface: '#1a1d27',
  surface2: '#222535',
  border: '#2e3347',
  textMuted: '#7880a0',
  textBright: '#eef0f8',
  text: '#d4d8e8',
} as const;

const TX_COLOR: Record<string, string> = {
  create: C.txCreate,
  load: C.txLoad,
  redeem: C.txRedeem,
  merge: C.txMerge,
};

const MEMBER_COLOR: Record<string, string> = {
  M1: C.M1,
  M2: C.M2,
  M3: C.M3,
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function shortTxId(id: string) {
  return id.slice(0, 16) + '…';
}

function fmtTime(ms: number) {
  try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

// ─── Block Chain Strip ──────────────────────────────────────────────────────

function groupByBlock(txs: TxReceipt[]): Array<[number, TxReceipt[]]> {
  const map = new Map<number, TxReceipt[]>();
  for (const tx of txs) {
    const bucket = map.get(tx.blockHeight) ?? [];
    bucket.push(tx);
    map.set(tx.blockHeight, bucket);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

function BlockCard({
  blockHeight,
  txs,
  isLatest,
}: {
  blockHeight: number;
  txs: TxReceipt[];
  isLatest: boolean;
}) {
  const accentBorder = isLatest ? C.M1 : C.border;

  return (
    <div
      style={{
        position: 'relative',
        width: 106,
        flexShrink: 0,
        background: isLatest ? 'rgba(91,138,245,0.07)' : C.surface,
        border: `1.5px solid ${accentBorder}`,
        borderRadius: 8,
        padding: '10px 10px 9px',
        transition: 'border-color 0.2s',
      }}
    >
      {isLatest && (
        <div
          style={{
            position: 'absolute',
            top: -9,
            left: '50%',
            transform: 'translateX(-50%)',
            background: C.M1,
            color: '#fff',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.07em',
            padding: '1px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          LATEST
        </div>
      )}

      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em' }}>
        BLOCK #{blockHeight}
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, color: C.textBright, lineHeight: 1, marginBottom: 7 }}>
        {txs.length}
        <span style={{ fontSize: 10, fontWeight: 500, color: C.textMuted, marginLeft: 3 }}>
          tx{txs.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {txs.map((tx) => (
          <span
            key={tx.txId}
            title={`${tx.type}${tx.amount != null ? ` · ${tx.amount} units` : ''}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: TX_COLOR[tx.type] ?? C.textMuted,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ChainArrow() {
  return (
    <div
      style={{
        width: 28,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.border,
        fontSize: 16,
        userSelect: 'none',
        position: 'relative',
        top: 1,
      }}
    >
      →
    </div>
  );
}

function ChainStrip({ txs, height }: { txs: TxReceipt[]; height: number }) {
  const blocks = groupByBlock(txs);

  return (
    <div>
      <div
        className="card-subtitle"
        style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}
      >
        {Object.entries({ create: 'create', load: 'load', redeem: 'redeem', merge: 'merge' }).map(([type]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: '50%', background: TX_COLOR[type], display: 'inline-block', flexShrink: 0 }}
            />
            {type}
          </span>
        ))}
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {blocks.length === 0 ? (
          <div className="empty-state">No blocks yet — run a scenario to mint the first transactions.</div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              minWidth: 'max-content',
              paddingTop: 14,
              paddingBottom: 4,
            }}
          >
            {blocks.map(([blockHeight, blockTxs], idx) => (
              <div key={blockHeight} style={{ display: 'flex', alignItems: 'center' }}>
                {idx > 0 && <ChainArrow />}
                <BlockCard
                  blockHeight={blockHeight}
                  txs={blockTxs}
                  isLatest={idx === blocks.length - 1}
                />
              </div>
            ))}
            {/* Show gap indicator if block height is much higher than grouped blocks */}
            {height > (blocks[blocks.length - 1]?.[0] ?? 0) + 1 && (
              <>
                <ChainArrow />
                <div style={{ fontSize: 11, color: C.textMuted, padding: '0 6px', whiteSpace: 'nowrap' }}>
                  …{height - (blocks[blocks.length - 1]?.[0] ?? 0) - 1} empty…
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Wallet Network (SVG) ───────────────────────────────────────────────────

const SVG_W = 660;
const COL_XS: Record<string, number> = {
  M1: SVG_W * 0.16,
  M2: SVG_W * 0.42,
  M3: SVG_W * 0.68,
  '?': SVG_W * 0.88,
};
const LANE_W = SVG_W * 0.22;
const LANE_PAD = SVG_W * 0.025;

interface WalletNode {
  address: string;
  balance: number;
  mergedInto?: string;
  memberId: string;
  x: number;
  y: number;
  r: number;
}

function computeNodes(wallets: WalletState[], ownerMap: Record<string, string>): WalletNode[] {
  if (wallets.length === 0) return [];

  const maxBal = Math.max(1, ...wallets.map((w) => w.balance));

  const enriched = wallets.map((w) => {
    const raw = ownerMap[w.address];
    const memberId = raw && ['M1', 'M2', 'M3'].includes(raw) ? raw : '?';
    const r = 14 + Math.sqrt(w.balance / maxBal) * 16;
    return { ...w, memberId, r };
  });

  const cols: Record<string, typeof enriched> = { M1: [], M2: [], M3: [], '?': [] };
  for (const w of enriched) cols[w.memberId].push(w);

  const nodes: WalletNode[] = [];
  const TOP_PAD = 42;
  const NODE_GAP = 14;

  for (const [colKey, colWallets] of Object.entries(cols)) {
    let curY = TOP_PAD;
    for (const w of colWallets) {
      curY += w.r;
      nodes.push({
        address: w.address,
        balance: w.balance,
        mergedInto: w.mergedInto,
        memberId: w.memberId,
        x: COL_XS[colKey],
        y: curY,
        r: w.r,
      });
      curY += w.r + NODE_GAP;
    }
  }

  return nodes;
}

function WalletGraph({
  snapshot,
  activity,
}: {
  snapshot: LedgerSnapshot;
  activity: ActivityRow[];
}) {
  const [tooltip, setTooltip] = useState<{ nodeX: number; nodeY: number; nodeR: number; text: string } | null>(null);

  const ownerMap: Record<string, string> = {};
  for (const row of activity) {
    if (row.wallet && row.owner_member_id) ownerMap[row.wallet] = row.owner_member_id;
  }

  const nodes = computeNodes(snapshot.wallets, ownerMap);
  const byAddr = Object.fromEntries(nodes.map((n) => [n.address, n]));

  const mergeEdges = nodes.filter((n) => n.mergedInto && byAddr[n.mergedInto]);

  if (nodes.length === 0) {
    return <div className="empty-state">No wallets on chain yet — run a scenario to see the network.</div>;
  }

  const maxY = Math.max(...nodes.map((n) => n.y + n.r)) + 28;
  const svgH = Math.max(160, maxY);

  const activeCols = (['M1', 'M2', 'M3'] as const).filter(
    (m) => nodes.some((n) => n.memberId === m),
  );

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${svgH}`}
          style={{ display: 'block', minWidth: 360 }}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <marker
              id="arrowMerge"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0.5 L0,5.5 L6,3 z" fill="#e06070" fillOpacity="0.75" />
            </marker>

            {activeCols.map((m) => (
              <radialGradient key={m} id={`glow-${m}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={MEMBER_COLOR[m]} stopOpacity="0.25" />
                <stop offset="100%" stopColor={MEMBER_COLOR[m]} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          {/* Column lanes */}
          {(['M1', 'M2', 'M3'] as const).map((m) => {
            const x = COL_XS[m] - LANE_W / 2 + LANE_PAD;
            const w = LANE_W - LANE_PAD * 2;
            return (
              <g key={m}>
                <rect
                  x={x}
                  y={0}
                  width={w}
                  height={svgH}
                  rx={8}
                  fill={MEMBER_COLOR[m]}
                  fillOpacity="0.04"
                  stroke={MEMBER_COLOR[m]}
                  strokeWidth="0.8"
                  strokeOpacity="0.18"
                />
                <text
                  x={COL_XS[m]}
                  y={18}
                  textAnchor="middle"
                  fill={MEMBER_COLOR[m]}
                  fontSize={11}
                  fontWeight={700}
                  opacity={0.65}
                  letterSpacing="0.05em"
                >
                  {m}
                </text>
              </g>
            );
          })}

          {/* Unknown column label (only if needed) */}
          {nodes.some((n) => n.memberId === '?') && (
            <text
              x={COL_XS['?']}
              y={18}
              textAnchor="middle"
              fill={C.textMuted}
              fontSize={10}
              opacity={0.5}
            >
              ?
            </text>
          )}

          {/* Merge edges */}
          {mergeEdges.map((n) => {
            const t = byAddr[n.mergedInto!];
            const dx = t.x - n.x;
            const dy = t.y - n.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;
            return (
              <line
                key={`edge-${n.address}`}
                x1={n.x + ux * (n.r + 1)}
                y1={n.y + uy * (n.r + 1)}
                x2={t.x - ux * (t.r + 8)}
                y2={t.y - uy * (t.r + 8)}
                stroke="#e06070"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeOpacity={0.55}
                markerEnd="url(#arrowMerge)"
              />
            );
          })}

          {/* Wallet nodes */}
          {nodes.map((n) => {
            const color = n.memberId === '?' ? C.unknown : MEMBER_COLOR[n.memberId];
            const isMerged = !!n.mergedInto;
            return (
              <g
                key={n.address}
                style={{ cursor: 'default' }}
                onMouseEnter={() =>
                  setTooltip({
                    nodeX: n.x,
                    nodeY: n.y,
                    nodeR: n.r,
                    text: `${shortAddr(n.address)} · ${n.balance} units${isMerged ? ' · merged' : ''}`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Glow halo for active wallets */}
                {!isMerged && (
                  <circle cx={n.x} cy={n.y} r={n.r + 10} fill={`url(#glow-${n.memberId})`} />
                )}

                {/* Node body */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill={isMerged ? C.surface2 : color}
                  fillOpacity={isMerged ? 1 : 0.18}
                  stroke={color}
                  strokeWidth={isMerged ? 1 : 2}
                  strokeOpacity={isMerged ? 0.3 : 0.9}
                  strokeDasharray={isMerged ? '3 2' : undefined}
                />

                {/* Address label */}
                <text
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isMerged ? C.textMuted : C.textBright}
                  fontSize={8}
                  fontWeight={600}
                  style={{ pointerEvents: 'none', fontFamily: 'monospace' }}
                >
                  {n.address.slice(2, 8)}…
                </text>

                {/* Balance label below */}
                {n.balance > 0 && (
                  <text
                    x={n.x}
                    y={n.y + n.r + 12}
                    textAnchor="middle"
                    fill={isMerged ? C.textMuted : color}
                    fontSize={9}
                    fontWeight={isMerged ? 400 : 600}
                    opacity={isMerged ? 0.5 : 0.85}
                    style={{ pointerEvents: 'none' }}
                  >
                    {n.balance}u
                  </text>
                )}
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (() => {
            const tx = tooltip.nodeX;
            const ty = tooltip.nodeY - tooltip.nodeR - 14;
            const tw = 220;
            const th = 20;
            const tx0 = Math.min(Math.max(tx - tw / 2, 4), SVG_W - tw - 4);
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect
                  x={tx0}
                  y={ty - th + 2}
                  width={tw}
                  height={th}
                  rx={4}
                  fill={C.surface2}
                  stroke={C.border}
                  strokeWidth={1}
                />
                <text
                  x={tx0 + tw / 2}
                  y={ty - 4}
                  textAnchor="middle"
                  fill={C.textBright}
                  fontSize={10}
                  style={{ fontFamily: 'monospace' }}
                >
                  {tooltip.text}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.9rem',
          marginTop: '0.75rem',
          fontSize: 11,
          color: C.textMuted,
        }}
      >
        {(['M1', 'M2', 'M3'] as const).map((m) => (
          <span key={m} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: MEMBER_COLOR[m],
                display: 'inline-block',
                opacity: 0.9,
              }}
            />
            {m}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="22" height="10" style={{ display: 'block' }}>
            <line x1="0" y1="5" x2="22" y2="5" stroke="#e06070" strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.75" />
          </svg>
          merge edge
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: `1.5px dashed ${C.textMuted}`,
              display: 'inline-block',
              opacity: 0.6,
            }}
          />
          merged (inactive)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: C.textMuted,
              display: 'inline-block',
              opacity: 0.35,
            }}
          />
          unknown owner
        </span>
      </div>
    </div>
  );
}

// ─── Transaction History ────────────────────────────────────────────────────

function TxFeed({ txs }: { txs: TxReceipt[] }) {
  const sorted = [...txs].sort((a, b) => b.at - a.at);

  if (sorted.length === 0) {
    return <div className="empty-state">No transactions yet.</div>;
  }

  return (
    <div className="scroll-list" style={{ maxHeight: 300 }}>
      {sorted.map((tx) => {
        const color = TX_COLOR[tx.type] ?? C.textMuted;
        return (
          <div key={tx.txId} className="activity-item">
            <div className="activity-main">
              <div className="activity-id">
                <span style={{ color, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem' }}>
                  {tx.type}
                </span>
                {tx.amount != null && (
                  <span style={{ color: C.textMuted, fontWeight: 400 }}> · {tx.amount} units</span>
                )}
              </div>
              <div className="activity-meta">
                <span className="activity-wallet mono" style={{ fontSize: '0.75rem' }}>
                  {shortTxId(tx.txId)}
                </span>
                <span style={{ marginLeft: '0.5rem', color: C.textMuted }}>block #{tx.blockHeight}</span>
              </div>
              {(tx.from ?? tx.to) && (
                <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: 2 }}>
                  {tx.from && <span>from <span className="mono">{shortAddr(tx.from)}</span></span>}
                  {tx.from && tx.to && <span> → </span>}
                  {tx.to && <span>to <span className="mono">{shortAddr(tx.to)}</span></span>}
                </div>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.textMuted, textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              {fmtTime(tx.at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snap, act] = await Promise.all([getLedgerSnapshot(), getActivity()]);
      setSnapshot(snap);
      setActivity(act);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalUnits = snapshot?.wallets.reduce((s, w) => s + w.balance, 0) ?? 0;

  return (
    <div>
      {/* Header */}
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h2>Ledger</h2>
          <p>Graphical view of the simulated blockchain — block chain, wallet network, and transaction history.</p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void load()}
          disabled={loading}
          style={{ flexShrink: 0, marginTop: 4 }}
        >
          {loading ? '↻ Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {snapshot ? (
        <>
          {/* Stats */}
          <div className="grid-3" style={{ marginBottom: '1.25rem' }}>
            <div className="card">
              <div className="stat-box">
                <div className="stat-value">{snapshot.height}</div>
                <div className="stat-label">Block height</div>
              </div>
            </div>
            <div className="card">
              <div className="stat-box">
                <div className="stat-value">{snapshot.txs.length}</div>
                <div className="stat-label">Transactions</div>
              </div>
            </div>
            <div className="card">
              <div className="stat-box">
                <div className="stat-value">{snapshot.activeWalletCount}</div>
                <div className="stat-label">Active wallets</div>
              </div>
            </div>
          </div>

          {/* Block chain */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title">Block chain</div>
            <ChainStrip txs={snapshot.txs} height={snapshot.height} />
          </div>

          {/* Wallet network */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="card-title">Wallet network</div>
            <div
              className="card-subtitle"
              style={{ marginBottom: '0.875rem' }}
            >
              Nodes sized by balance. Lanes show owning member. Dashed arrows indicate wallet merges.
              {totalUnits > 0 && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--accent2)', fontWeight: 600 }}>
                  {totalUnits.toLocaleString()} total units on chain.
                </span>
              )}
            </div>
            <WalletGraph snapshot={snapshot} activity={activity} />
          </div>

          {/* Transaction history */}
          <div className="card">
            <div className="card-title">Transaction history</div>
            <TxFeed txs={snapshot.txs} />
          </div>
        </>
      ) : (
        !error && <div className="empty-state">Loading ledger…</div>
      )}
    </div>
  );
}
