import {
  utf8,
  toB64,
  fromB64,
  toHex,
  normalizeIdentifier,
  deriveLookupTag,
  deriveWalletKey,
  sealPayload,
  dummyBlob,
  logger,
  type IdScheme,
  type MetaResponse,
  type LookupResponse,
  type OnboardResponse,
} from '@bbnew/shared';
import { OprfKeyManager, SUITE } from '@bbnew/voprf';
import type { Ledger } from '@bbnew/ledger';
import { Repository, type BeneficiaryRec } from './persistence/repository.js';
import { KeyedMutex } from './keyed-mutex.js';
import { crossMemberQuery, type PeerRef, type QueryHit } from './peer-client.js';

export interface MemberConfig {
  memberId: string;
  ledger: Ledger;
  snapshotPath?: string;
  /** Serialize same-person onboarding (sim convenience). Disable to exercise
   *  the genuine concurrent-onboarding race + reconciliation path. */
  mutexEnabled?: boolean;
}

/** Total order on (ownerMemberId, wallet) — the coordinator-free tie-break. */
function better(a: QueryHit, b: QueryHit): QueryHit {
  if (a.ownerMemberId !== b.ownerMemberId) {
    return a.ownerMemberId < b.ownerMemberId ? a : b;
  }
  return a.wallet <= b.wallet ? a : b;
}

export class Member {
  readonly memberId: string;
  private readonly repo: Repository;
  private readonly km: OprfKeyManager;
  private readonly ledger: Ledger;
  private readonly mutex = new KeyedMutex();
  private readonly mutexEnabled: boolean;
  private peers: PeerRef[] = [];

  private constructor(cfg: MemberConfig, repo: Repository) {
    this.memberId = cfg.memberId;
    this.repo = repo;
    this.ledger = cfg.ledger;
    this.mutexEnabled = cfg.mutexEnabled ?? true;
    this.km = new OprfKeyManager(fromB64(repo.state.masterSeedB64));
  }

  static create(cfg: MemberConfig): Member {
    return new Member(cfg, Repository.open(cfg.memberId, cfg.snapshotPath));
  }

  setPeers(peers: PeerRef[]): void {
    this.peers = peers;
  }

  // ---- HTTP-facing operations -------------------------------------------

  async meta(): Promise<MetaResponse> {
    const v = this.repo.state.activeVersion;
    return {
      memberId: this.memberId,
      suite: SUITE,
      activeKeyVersion: v,
      activePublicKeyB64: toB64(await this.km.publicKey(v)),
      answerableVersions: this.repo.answerableVersions(),
    };
  }

  async oprfEvaluate(
    keyVersion: number,
    evaluationRequestB64: string,
  ): Promise<{ status: 409 } | { status: 200; evaluationB64: string }> {
    if (!this.repo.isAnswerable(keyVersion)) return { status: 409 };
    return {
      status: 200,
      evaluationB64: await this.km.blindEvaluateB64(evaluationRequestB64, keyVersion),
    };
  }

  /** Match-oblivious: ALWAYS a fixed-length blob, identical shape on miss. */
  async lookup(keyVersion: number, tagB64: string): Promise<LookupResponse> {
    if (this.repo.isAnswerable(keyVersion)) {
      const tagHex = toHex(fromB64(tagB64));
      const entry = this.repo.table(keyVersion)[tagHex];
      if (entry) return { nonceB64: entry.nonceB64, blobB64: entry.blobB64 };
    }
    const d = dummyBlob();
    return { nonceB64: toB64(d.nonce), blobB64: toB64(d.ciphertext) };
  }

  async onboard(
    idRaw: string,
    scheme: IdScheme,
    amount: number,
  ): Promise<OnboardResponse> {
    const id = normalizeIdentifier(idRaw, scheme);
    const work = (): Promise<OnboardResponse> => this.onboardInner(id, amount);
    return this.mutexEnabled ? this.mutex.run(id, work) : work();
  }

  private async onboardInner(id: string, amount: number): Promise<OnboardResponse> {
    const local = this.repo.state.beneficiaries[id];
    if (local) {
      this.ledger.loadAssistance(local.wallet, amount);
      this.repo.save();
      return {
        wallet: local.wallet,
        adopted: false,
        ownerMemberId: local.ownerMemberId,
        keyVersion: this.repo.state.activeVersion,
      };
    }

    const candidates: QueryHit[] = [];
    for (const peer of [...this.peers].sort((a, b) =>
      a.memberId < b.memberId ? -1 : 1,
    )) {
      try {
        const hit = await crossMemberQuery(this.memberId, peer, id);
        if (hit) candidates.push(hit);
      } catch (err) {
        // DLEQ failure or transport error: cannot trust/deduplicate against
        // this peer right now — safe local decision is "no answer".
        logger.warn(
          { peer: peer.memberId, err: String(err) },
          'cross-member query failed',
        );
      }
    }

    let rec: BeneficiaryRec;
    let adopted: boolean;
    if (candidates.length > 0) {
      const winner = candidates.reduce(better);
      rec = { wallet: winner.wallet, ownerMemberId: winner.ownerMemberId };
      adopted = true;
    } else {
      rec = { wallet: this.ledger.createWallet().address, ownerMemberId: this.memberId };
      adopted = false;
    }

    await this.putBeneficiary(id, rec);
    this.ledger.loadAssistance(rec.wallet, amount);
    this.repo.save();
    return {
      wallet: rec.wallet,
      adopted,
      ownerMemberId: rec.ownerMemberId,
      keyVersion: this.repo.state.activeVersion,
    };
  }

  // ---- key rotation ------------------------------------------------------

  async rotate(): Promise<number> {
    const old = this.repo.state.activeVersion;
    const next = old + 1;
    for (const vm of this.repo.state.versions) {
      if (vm.status === 'grace') {
        vm.status = 'retired';
        delete this.repo.state.tables[String(vm.version)];
      }
    }
    const oldMeta = this.repo.state.versions.find((v) => v.version === old);
    if (oldMeta) oldMeta.status = 'grace';
    this.repo.state.versions.push({ version: next, status: 'active', createdAt: Date.now() });
    this.repo.state.activeVersion = next;
    this.repo.state.tables[String(next)] = {};
    for (const [id, rec] of Object.entries(this.repo.state.beneficiaries)) {
      await this.indexBeneficiary(id, rec, next);
    }
    this.repo.save();
    return next;
  }

  // ---- concurrent-onboarding reconciliation ------------------------------

  /**
   * For every locally-known beneficiary, find the network-wide authoritative
   * wallet (smallest ownerMemberId) and converge to it via `mergeWallets`.
   * Deterministic total order ⇒ one pass over all members converges with no
   * coordinator.
   */
  async reconcile(): Promise<Array<{ id: string; from: string; to: string }>> {
    const merges: Array<{ id: string; from: string; to: string }> = [];
    for (const [id, local] of Object.entries({ ...this.repo.state.beneficiaries })) {
      let winner: QueryHit = { wallet: local.wallet, ownerMemberId: local.ownerMemberId };
      for (const peer of this.peers) {
        try {
          const hit = await crossMemberQuery(this.memberId, peer, id);
          if (hit) winner = better(winner, hit);
        } catch (err) {
          logger.warn({ peer: peer.memberId, err: String(err) }, 'reconcile query failed');
        }
      }
      if (winner.wallet !== local.wallet) {
        this.ledger.mergeWallets(local.wallet, winner.wallet);
        await this.putBeneficiary(id, {
          wallet: winner.wallet,
          ownerMemberId: winner.ownerMemberId,
        });
        merges.push({ id, from: local.wallet, to: winner.wallet });
      }
    }
    this.repo.save();
    return merges;
  }

  // ---- internals ---------------------------------------------------------

  private async indexBeneficiary(
    id: string,
    rec: BeneficiaryRec,
    version: number,
  ): Promise<void> {
    const raw = await this.km.evaluate(utf8(id), version);
    const tag = await deriveLookupTag(raw, version);
    const tagHex = toHex(tag);
    const encKey = await deriveWalletKey(raw, version);
    const aad = utf8(`BBNew|${version}|${tagHex}`);
    const sealed = await sealPayload(
      encKey,
      JSON.stringify({ o: rec.ownerMemberId, w: rec.wallet }),
      aad,
    );
    this.repo.table(version)[tagHex] = {
      nonceB64: toB64(sealed.nonce),
      blobB64: toB64(sealed.ciphertext),
    };
  }

  private async putBeneficiary(id: string, rec: BeneficiaryRec): Promise<void> {
    this.repo.state.beneficiaries[id] = rec;
    for (const v of this.repo.answerableVersions()) {
      await this.indexBeneficiary(id, rec, v);
    }
    this.repo.save();
  }
}
