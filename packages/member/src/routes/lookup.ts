import type { FastifyInstance } from 'fastify';
import { LookupRequest, LookupResponse } from '@bbnew/shared';
import type { Member } from '../member.js';

/**
 * The match-oblivious membership probe. `Member.lookup` returns a fixed-length
 * blob whether or not the tag is present; the response shape here is therefore
 * identical for match and non-match. Re-parsing through `LookupResponse.strict()`
 * guarantees no extra field can ever leak match state.
 */
export function lookupRoute(app: FastifyInstance, member: Member): void {
  app.post('/lookup', async (req, reply) => {
    const body = LookupRequest.parse(req.body);
    const res = await member.lookup(body.keyVersion, body.tagB64);
    return reply.send(LookupResponse.parse(res));
  });
}
