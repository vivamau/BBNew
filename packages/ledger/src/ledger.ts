import { randomBytes } from 'node:crypto';
import { saveJson, loadJson } from './store.js';

/**
 * Simulated blockchain. Wallet addresses are random 20-byte hex values with NO
 * derivation from any identifier — anonymity on chain is structural, not
 * cryptographically argued. This module is deliberately a simulation; replacing
 * it with a real chain is out of scope unless explicitly requested.
 */

export type TxType = 'create' | 'load' | 'redeem' | 'merge';

export interface TxReceipt {
  txId: string;
  type: TxType;
  from?: string;
  to?: string;
  amount?: number;
  blockHeight: number;
  at: number;
}

interface WalletState {
  address: string;
  balance: number;
  mergedInto?: string;
  createdAt: number;
}

interface LedgerState {
  wallets: Record<string, WalletState>;
  txs: TxReceipt[];
}

export class Ledger {
  private wallets = new Map<string, WalletState>();
  private txs: TxReceipt[] = [];

  constructor(private readonly persistPath?: string) {
    if (persistPath) {
      const snap = loadJson<LedgerState>(persistPath);
      if (snap) {
        for (const w of Object.values(snap.wallets)) this.wallets.set(w.address, w);
        this.txs = snap.txs;
      }
    }
  }

  private save(): void {
    if (!this.persistPath) return;
    const wallets: Record<string, WalletState> = {};
    for (const [k, v] of this.wallets) wallets[k] = v;
    saveJson(this.persistPath, { wallets, txs: this.txs } satisfies LedgerState);
  }

  private record(tx: Omit<TxReceipt, 'txId' | 'blockHeight' | 'at'>): TxReceipt {
    const receipt: TxReceipt = {
      txId: randomBytes(8).toString('hex'),
      blockHeight: this.txs.length,
      at: Date.now(),
      ...tx,
    };
    this.txs.push(receipt);
    return receipt;
  }

  /** Follow the merge chain to the surviving wallet. */
  private resolve(address: string): WalletState {
    let cur = this.wallets.get(address);
    if (!cur) throw new Error(`ledger: unknown wallet ${address}`);
    const seen = new Set<string>();
    while (cur.mergedInto) {
      if (seen.has(cur.address)) throw new Error('ledger: merge cycle detected');
      seen.add(cur.address);
      const next = this.wallets.get(cur.mergedInto);
      if (!next) throw new Error(`ledger: dangling merge target ${cur.mergedInto}`);
      cur = next;
    }
    return cur;
  }

  createWallet(): { address: string } {
    let address: string;
    do {
      address = `0x${randomBytes(20).toString('hex')}`;
    } while (this.wallets.has(address));
    this.wallets.set(address, { address, balance: 0, createdAt: Date.now() });
    this.record({ type: 'create', to: address });
    this.save();
    return { address };
  }

  loadAssistance(address: string, amount: number): TxReceipt {
    if (amount <= 0) throw new Error('ledger: amount must be positive');
    const w = this.resolve(address);
    w.balance += amount;
    const r = this.record({ type: 'load', to: w.address, amount });
    this.save();
    return r;
  }

  getBalance(address: string): number {
    return this.resolve(address).balance;
  }

  redeem(address: string, amount: number): TxReceipt {
    if (amount <= 0) throw new Error('ledger: amount must be positive');
    const w = this.resolve(address);
    if (w.balance < amount) {
      throw new Error(`ledger: insufficient balance (have ${w.balance}, need ${amount})`);
    }
    w.balance -= amount;
    const r = this.record({ type: 'redeem', from: w.address, amount });
    this.save();
    return r;
  }

  /**
   * Reconciliation primitive for the concurrent-onboarding race: move the
   * loser's balance into the winner and point the loser at it. Idempotent.
   */
  mergeWallets(loser: string, winner: string): TxReceipt {
    const l = this.resolve(loser);
    const w = this.resolve(winner);
    if (l.address === w.address) {
      return this.record({ type: 'merge', from: l.address, to: w.address, amount: 0 });
    }
    const moved = l.balance;
    w.balance += moved;
    l.balance = 0;
    l.mergedInto = w.address;
    const r = this.record({ type: 'merge', from: l.address, to: w.address, amount: moved });
    this.save();
    return r;
  }

  /** True iff `address` is the surviving wallet (not merged away). */
  isActive(address: string): boolean {
    return this.resolve(address).address === address;
  }

  snapshot(): {
    height: number;
    wallets: WalletState[];
    txs: TxReceipt[];
    activeWalletCount: number;
  } {
    const wallets = [...this.wallets.values()];
    return {
      height: this.txs.length,
      wallets,
      txs: this.txs,
      activeWalletCount: wallets.filter((w) => !w.mergedInto).length,
    };
  }
}
