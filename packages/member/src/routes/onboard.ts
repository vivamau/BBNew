import type { FastifyInstance } from 'fastify';
import { OnboardRequest, OnboardResponse, type IdScheme } from '@bbnew/shared';
import type { Member } from '../member.js';

/**
 * Drives the no-duplicate-wallet flow: local check → deterministic fan-out to
 * peers → adopt the authoritative wallet or mint a new one. The raw identifier
 * is consumed here and normalized inside `Member`; it never leaves this process
 * boundary.
 */
export function onboardRoute(app: FastifyInstance, member: Member): void {
  app.post('/onboard', async (req, reply) => {
    const body = OnboardRequest.parse(req.body);
    const res = await member.onboard(body.idRaw, body.scheme as IdScheme, body.amount);
    return reply.send(OnboardResponse.parse(res));
  });
}
