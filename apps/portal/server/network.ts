import { Ledger } from '@bbnew/ledger';
import { createMemberServer, type RunningMember } from '@bbnew/member';

export const MEMBER_IDS = ['M1', 'M2', 'M3'] as const;
export type MemberId = (typeof MEMBER_IDS)[number];

export interface Network {
  ledger: Ledger;
  members: Record<string, RunningMember>;
  close: () => Promise<void>;
}

export async function startNetwork(opts: { mutexEnabled?: boolean } = {}): Promise<Network> {
  const ledger = new Ledger();
  const members: Record<string, RunningMember> = {};
  for (const id of MEMBER_IDS) {
    members[id] = await createMemberServer(
      { memberId: id, ledger, mutexEnabled: opts.mutexEnabled ?? true },
      0,
    );
  }
  for (const id of MEMBER_IDS) {
    members[id]!.setPeers(
      MEMBER_IDS.filter((x) => x !== id).map((x) => ({
        memberId: x,
        baseUrl: members[x]!.baseUrl,
      })),
    );
  }
  return {
    ledger,
    members,
    close: async () => {
      await Promise.all(Object.values(members).map((m) => m.close()));
    },
  };
}
