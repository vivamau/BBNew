import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { wireAudit } from '@bbnew/shared';
import type { Member } from './member.js';
import { registerRoutes } from './routes/index.js';

export interface ServerOptions {
  /** If set, `/oprf/evaluate` is fixed-window rate-limited per requesting member. */
  rateLimitPerMinute?: number;
}

function routePath(req: FastifyRequest): string {
  return req.routeOptions?.url ?? req.url;
}

export function buildApp(member: Member, opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  // In-process tap proving what does (and does not) cross the wire.
  app.addHook('preHandler', async (req) => {
    wireAudit.record({
      dir: 'in',
      from: String(req.headers['x-bbnew-member'] ?? '?'),
      to: member.memberId,
      method: req.method,
      path: routePath(req),
      body: (req.body as unknown) ?? null,
      at: Date.now(),
    });
  });
  app.addHook('onSend', async (req, _reply, payload) => {
    let body: unknown = payload;
    if (typeof payload === 'string') {
      try {
        body = JSON.parse(payload);
      } catch {
        /* non-JSON: keep raw */
      }
    }
    wireAudit.record({
      dir: 'in',
      from: member.memberId,
      to: String(req.headers['x-bbnew-member'] ?? '?'),
      method: req.method,
      path: routePath(req),
      body,
      at: Date.now(),
    });
    return payload;
  });

  registerRoutes(app, member, opts);
  return app;
}
