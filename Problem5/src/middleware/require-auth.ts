import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth';
import { db } from '../db/client';
import { permissions, rolePermissions, userOffices, userRoles, users } from '../db/schema/iam';

export type AuthedUser = typeof users.$inferSelect;

export interface AuthedContext {
  Variables: {
    user: AuthedUser;
    permissions: Set<string>;
    sessionId: string;
    officeIds: string[];
  };
}

export const requireAuth: MiddlewareHandler<AuthedContext> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user || user.deletedAt !== null || user.status !== 'active') {
    return c.json({ error: 'Account inactive' }, 403);
  }

  const [permRows, officeRows] = await Promise.all([
    db
      .select({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, user.id)),
    db
      .select({ officeId: userOffices.officeId })
      .from(userOffices)
      .where(eq(userOffices.userId, user.id)),
  ]);

  c.set('user', user);
  c.set('permissions', new Set(permRows.map((r) => r.code)));
  c.set('sessionId', session.session.id);
  c.set('officeIds', officeRows.map((r) => r.officeId));

  void db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
    .execute();

  await next();
};
