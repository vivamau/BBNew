import { Ledger } from '@bbnew/ledger';
import { createMemberServer, type RunningMember } from '@bbnew/member';
import type { WireRecord } from '@bbnew/shared';

export interface Network {
  ledger: Ledger;
  members: Record<string, RunningMember>;
  close: () => Promise<void>;
}

/** Spin N member services in-process, sharing one simulated chain, fully meshed. */
export async function startNetwork(
  memberIds: string[],
  opts: { mutexEnabled?: boolean } = {},
): Promise<Network> {
  const ledger = new Ledger();
  const members: Record<string, RunningMember> = {};
  for (const id of memberIds) {
    members[id] = await createMemberServer(
      { memberId: id, ledger, mutexEnabled: opts.mutexEnabled ?? true },
      0, // ephemeral port
    );
  }
  for (const id of memberIds) {
    members[id]!.setPeers(
      memberIds
        .filter((x) => x !== id)
        .map((x) => ({ memberId: x, baseUrl: members[x]!.baseUrl })),
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

/** The protocol surface that crosses BETWEEN members (excludes local control). */
export const CROSS_MEMBER_PATHS = ['/meta', '/oprf/evaluate', '/lookup'];

export function isCrossMemberTraffic(memberIds: string[]) {
  const ids = new Set(memberIds);
  return (r: WireRecord): boolean =>
    CROSS_MEMBER_PATHS.includes(r.path) && ids.has(r.from) && ids.has(r.to);
}
