import { createMiddleware } from 'hono/factory';
import type { AuthedContext } from './require-auth';

export function requirePermission(
  ...codes: [string, ...string[]]
) {
  return createMiddleware<AuthedContext>(async (c, next) => {
    const perms = c.get('permissions');
    if (!perms) {
      return c.json({ error: 'Missing auth context — call requireAuth first' }, 500);
    }
    const has = codes.some((code) => perms.has(code));
    if (!has) {
      return c.json(
        { error: `Forbidden — requires one of: ${codes.join(', ')}` },
        403,
      );
    }
    await next();
  });
}
