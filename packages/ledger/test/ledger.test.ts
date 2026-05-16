import { describe, it, expect } from 'vitest';
import { Ledger } from '@bbnew/ledger';

describe('@bbnew/ledger', () => {
  it('mints anonymous wallets and tracks balances', () => {
    const l = new Ledger();
    const { address } = l.createWallet();
    expect(address).toMatch(/^0x[0-9a-f]{40}$/);
    l.loadAssistance(address, 100);
    l.loadAssistance(address, 25);
    expect(l.getBalance(address)).toBe(125);
  });

  it('guards redeem underflow', () => {
    const l = new Ledger();
    const { address } = l.createWallet();
    l.loadAssistance(address, 30);
    expect(() => l.redeem(address, 50)).toThrow(/insufficient/);
    l.redeem(address, 30);
    expect(l.getBalance(address)).toBe(0);
  });

  it('mergeWallets moves balance, resolves through the merge chain, is idempotent', () => {
    const l = new Ledger();
    const a = l.createWallet().address;
    const b = l.createWallet().address;
    l.loadAssistance(a, 40);
    l.loadAssistance(b, 60);
    l.mergeWallets(b, a);
    expect(l.getBalance(a)).toBe(100);
    expect(l.getBalance(b)).toBe(100); // resolves to survivor
    expect(l.isActive(b)).toBe(false);
    expect(l.snapshot().activeWalletCount).toBe(1);
    // idempotent: merging again does not double-count
    l.mergeWallets(b, a);
    expect(l.getBalance(a)).toBe(100);
    // loading to the merged address lands on the survivor
    l.loadAssistance(b, 10);
    expect(l.getBalance(a)).toBe(110);
  });
});
