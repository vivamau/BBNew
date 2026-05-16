import type { FastifyInstance } from 'fastify';
import { Member, type MemberConfig } from './member.js';
import { buildApp, type ServerOptions } from './app.js';
import type { PeerRef } from './peer-client.js';

export interface RunningMember {
  member: Member;
  app: FastifyInstance;
  baseUrl: string;
  setPeers: (peers: PeerRef[]) => void;
  close: () => Promise<void>;
}

export async function createMemberServer(
  cfg: MemberConfig,
  port: number,
  opts: ServerOptions = {},
): Promise<RunningMember> {
  const member = Member.create(cfg);
  const app = buildApp(member, opts);
  await app.listen({ port, host: '127.0.0.1' });
  const addr = app.server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  return {
    member,
    app,
    baseUrl: `http://127.0.0.1:${actualPort}`,
    setPeers: (peers) => member.setPeers(peers),
    close: () => app.close(),
  };
}
