import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { AuthedContext } from '../middleware/require-auth';

export interface Actor {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
}

export function actorFromContext(c: Context<AuthedContext>): Actor {
  const headers = c.req.raw.headers;
  let ipAddress: string | null =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    null;
  if (!ipAddress) {
    try {
      const info = getConnInfo(c);
      const raw = info.remote.address ?? null;
      ipAddress = raw?.startsWith('::ffff:') ? raw.slice(7) : raw;
    } catch {
      // no socket (tests)
    }
  }
  return {
    id: c.get('user').id,
    ipAddress,
    userAgent: headers.get('user-agent') ?? null,
    sessionId: c.get('sessionId') ?? null,
  };
}

export function actorMetadata(actor: Actor): Record<string, unknown> {
  return {
    ...(actor.ipAddress ? { ipAddress: actor.ipAddress } : {}),
    ...(actor.userAgent ? { userAgent: actor.userAgent } : {}),
    ...(actor.sessionId ? { sessionId: actor.sessionId } : {}),
  };
}
