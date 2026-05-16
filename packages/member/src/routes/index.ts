import type { FastifyInstance } from 'fastify';
import {
  MetaResponse,
  OprfEvaluateRequest,
  OprfEvaluateResponse,
  RotateResponse,
} from '@bbnew/shared';
import type { Member } from '../member.js';
import type { ServerOptions } from '../app.js';
import { lookupRoute } from './lookup.js';
import { onboardRoute } from './onboard.js';

function makeLimiter(perMinute?: number): (who: string) => boolean {
  if (!perMinute) return () => true;
  const windows = new Map<string, { start: number; count: number }>();
  return (who) => {
    const now = Date.now();
    const w = windows.get(who);
    if (!w || now - w.start >= 60_000) {
      windows.set(who, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= perMinute;
  };
}

export function registerRoutes(
  app: FastifyInstance,
  member: Member,
  opts: ServerOptions,
): void {
  app.get('/meta', async () => MetaResponse.parse(await member.meta()));

  const limiter = makeLimiter(opts.rateLimitPerMinute);
  app.post('/oprf/evaluate', async (req, reply) => {
    const who = String(req.headers['x-bbnew-member'] ?? 'anon');
    if (!limiter(who)) return reply.code(429).send({ error: 'rate limited' });
    const body = OprfEvaluateRequest.parse(req.body);
    const r = await member.oprfEvaluate(body.keyVersion, body.evaluationRequestB64);
    if (r.status === 409) {
      return reply.code(409).send({ error: 'key version not answerable' });
    }
    return reply.send(OprfEvaluateResponse.parse({ evaluationB64: r.evaluationB64 }));
  });

  lookupRoute(app, member);
  onboardRoute(app, member);

  app.post('/admin/rotate', async () =>
    RotateResponse.parse({ newVersion: await member.rotate() }),
  );
  app.post('/admin/reconcile', async () => ({ merges: await member.reconcile() }));
}
