export interface OnboardResult {
  wallet: string;
  adopted: boolean;
  ownerMemberId: string;
}

export interface ActivityRow {
  id: number;
  ts: string;
  beneficiary_id_raw: string;
  scheme: string;
  member_id: string;
  wallet: string;
  owner_member_id: string;
  adopted: number;
  amount: number;
}

export interface WalletState {
  address: string;
  balance: number;
  mergedInto?: string;
  createdAt: number;
}

export interface TxReceipt {
  txId: string;
  type: string;
  from?: string;
  to?: string;
  amount?: number;
  blockHeight: number;
  at: number;
}

export interface LedgerSnapshot {
  height: number;
  wallets: WalletState[];
  txs: TxReceipt[];
  activeWalletCount: number;
}

export interface MemberMeta {
  memberId: string;
  baseUrl: string;
  suite: string;
  activeKeyVersion: number;
  activePublicKeyB64: string;
  answerableVersions: number[];
}

export interface NetworkStatus {
  members: MemberMeta[];
  ledger: { activeWalletCount: number; height: number };
}

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const getNetworkStatus = () => api<NetworkStatus>('/network/status');

export const getLedgerSnapshot = () => api<LedgerSnapshot>('/ledger/snapshot');

export const getWalletBalance = (wallet: string) =>
  api<{ wallet: string; balance: number; isActive: boolean } | { error: string }>(
    `/ledger/balance/${encodeURIComponent(wallet)}`,
  );

export const onboard = (params: {
  memberId: string;
  idRaw: string;
  scheme: string;
  amount: number;
}) =>
  api<OnboardResult | { error: string }>('/onboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });

export const getActivity = () => api<ActivityRow[]>('/activity');

export const rotateMemberKey = (memberId: string) =>
  api<{ activeKeyVersion: number } | { error: string }>(`/admin/${memberId}/rotate`, {
    method: 'POST',
  });

export const reconcileMember = (memberId: string) =>
  api<{ merges: number } | { error: string }>(`/admin/${memberId}/reconcile`, {
    method: 'POST',
  });

export const resetActivity = () => api<{ ok: boolean }>('/dev/reset-activity', { method: 'POST' });
