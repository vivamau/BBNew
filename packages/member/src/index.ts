export { Member, type MemberConfig } from './member.js';
export { buildApp, type ServerOptions } from './app.js';
export { createMemberServer, type RunningMember } from './server.js';
export { crossMemberQuery, type PeerRef, type QueryHit } from './peer-client.js';
export { Repository } from './persistence/repository.js';
export type {
  MemberState,
  BeneficiaryRec,
  VersionMeta,
  VersionStatus,
} from './persistence/repository.js';
