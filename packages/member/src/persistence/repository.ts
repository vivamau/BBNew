import { randomBytes, toB64 } from '@bbnew/shared';
import { saveJson, loadJson } from '@bbnew/ledger';

export type VersionStatus = 'active' | 'grace' | 'retired';

export interface VersionMeta {
  version: number;
  status: VersionStatus;
  createdAt: number;
}

/** owner member id + wallet are sealed INSIDE the blob, never in the clear. */
export interface TableEntry {
  nonceB64: string;
  blobB64: string;
}

export interface BeneficiaryRec {
  wallet: string;
  ownerMemberId: string;
}

export interface MemberState {
  memberId: string;
  masterSeedB64: string;
  activeVersion: number;
  versions: VersionMeta[];
  /** version -> tagHex -> entry */
  tables: Record<string, Record<string, TableEntry>>;
  /** idNormalized -> record. This is the member's OWN cleartext store: it is
   *  lawful local data and is NEVER shared with another member. */
  beneficiaries: Record<string, BeneficiaryRec>;
}

/**
 * Per-member persistence. In-memory state with an optional atomic JSON snapshot
 * (load on boot, write on mutation) behind one interface so the storage engine
 * can be swapped without touching protocol code.
 */
export class Repository {
  private constructor(
    public state: MemberState,
    private readonly path?: string,
  ) {}

  static open(memberId: string, path?: string): Repository {
    const existing = path ? loadJson<MemberState>(path) : undefined;
    if (existing) return new Repository(existing, path);
    const state: MemberState = {
      memberId,
      masterSeedB64: toB64(randomBytes(32)),
      activeVersion: 0,
      versions: [{ version: 0, status: 'active', createdAt: Date.now() }],
      tables: { '0': {} },
      beneficiaries: {},
    };
    const repo = new Repository(state, path);
    repo.save();
    return repo;
  }

  save(): void {
    if (this.path) saveJson(this.path, this.state);
  }

  versionStatus(version: number): VersionStatus | undefined {
    return this.state.versions.find((v) => v.version === version)?.status;
  }

  isAnswerable(version: number): boolean {
    const s = this.versionStatus(version);
    return s === 'active' || s === 'grace';
  }

  answerableVersions(): number[] {
    return this.state.versions
      .filter((v) => v.status !== 'retired')
      .map((v) => v.version);
  }

  table(version: number): Record<string, TableEntry> {
    const key = String(version);
    this.state.tables[key] ??= {};
    return this.state.tables[key];
  }
}
