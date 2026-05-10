import { and, desc, eq, ilike, inArray, isNull, or, sql as dsql } from 'drizzle-orm';
import { auth } from '../../auth';
import { db } from '../../db/client';
import { writeAudit } from '../../lib/audit';
import type { Actor } from '../../lib/actor';
import { actorMetadata } from '../../lib/actor';
import { parseBoolFlag } from '../../lib/query-flags';
import { offices, permissions, rolePermissions, roles, userOffices, userRoles, users } from '../../db/schema/iam';

type UserSelect = typeof users.$inferSelect;

function toUserResponse(u: UserSelect, roleCodes: string[] = []) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    emailVerified: u.emailVerified,
    status: u.status as 'active' | 'inactive' | 'locked',
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    deletedAt: u.deletedAt?.toISOString() ?? null,
    roles: roleCodes,
  };
}

// ── LIST (with office scope) ─────────────────────────────────
export async function listUsers(query: {
  page?: string; pageSize?: string; q?: string; includeDeleted?: string;
  scopeOfficeIds?: string[];
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  // If scoped, get user IDs in those offices first
  let scopedUserIds: string[] | undefined;
  if (query.scopeOfficeIds && query.scopeOfficeIds.length > 0) {
    const scopeRows = await db
      .selectDistinct({ userId: userOffices.userId })
      .from(userOffices)
      .where(inArray(userOffices.officeId, query.scopeOfficeIds));
    scopedUserIds = scopeRows.map((r) => r.userId);
    if (scopedUserIds.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
  }

  const whereClauses = [];
  if (!parseBoolFlag(query.includeDeleted)) whereClauses.push(isNull(users.deletedAt));
  if (query.q) {
    whereClauses.push(or(ilike(users.email, `%${query.q}%`), ilike(users.name, `%${query.q}%`))!);
  }
  if (scopedUserIds) {
    whereClauses.push(inArray(users.id, scopedUserIds));
  }
  const whereExpr = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const [rows, countRows] = await Promise.all([
    db.select().from(users).where(whereExpr).orderBy(desc(users.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: dsql<number>`CAST(count(*) AS INT)` }).from(users).where(whereExpr),
  ]);

  const userIds = rows.map((u) => u.id);
  const rolePairs = userIds.length
    ? await db.select({ userId: userRoles.userId, code: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(inArray(userRoles.userId, userIds))
    : [];
  const rolesByUserId = new Map<string, string[]>();
  for (const pair of rolePairs) {
    const list = rolesByUserId.get(pair.userId) ?? [];
    list.push(pair.code);
    rolesByUserId.set(pair.userId, list);
  }

  return {
    items: rows.map((u) => toUserResponse(u, (rolesByUserId.get(u.id) ?? []).sort())),
    total: Number(countRows[0].count),
    page,
    pageSize,
  };
}

// ── DETAIL / PROFILE ─────────────────────────────────────────
export async function loadUserProfile(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user || user.deletedAt) return null;

  const [userRolesRows, permRows, officeRows] = await Promise.all([
    db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, id))
      .orderBy(roles.code),
    db
      .selectDistinct({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, id))
      .orderBy(permissions.code),
    db
      .select({ id: offices.id, code: offices.code, name: offices.name })
      .from(userOffices)
      .innerJoin(offices, eq(offices.id, userOffices.officeId))
      .where(eq(userOffices.userId, id))
      .orderBy(offices.name),
  ]);

  return {
    ...toUserResponse(user, userRolesRows.map((r) => r.code)),
    permissions: permRows.map((p) => p.code),
    offices: officeRows.map((o) => ({ id: o.id, code: o.code, name: o.name })),
  };
}

// ── CREATE ───────────────────────────────────────────────────
export type CreateUserResult =
  | { ok: true; payload: NonNullable<Awaited<ReturnType<typeof loadUserProfile>>> }
  | { ok: false; reason: 'email-exists'; email: string }
  | { ok: false; reason: 'unknown-roles'; missing: string[] }
  | { ok: false; reason: 'sign-up-failed' };

export async function createUser(
  body: { email: string; password: string; name: string; status?: string; roleCodes?: string[]; officeCodes?: string[] },
  actor: Actor,
): Promise<CreateUserResult> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
  if (existing) return { ok: false, reason: 'email-exists', email: body.email };

  let roleRows: { id: string; code: string }[] = [];
  if (body.roleCodes?.length) {
    roleRows = await db.select({ id: roles.id, code: roles.code }).from(roles).where(inArray(roles.code, body.roleCodes));
    const found = new Set(roleRows.map((r) => r.code));
    const missing = body.roleCodes.filter((c) => !found.has(c));
    if (missing.length > 0) return { ok: false, reason: 'unknown-roles', missing };
  }

  let officeRows: { id: string; code: string }[] = [];
  if (body.officeCodes?.length) {
    officeRows = await db.select({ id: offices.id, code: offices.code }).from(offices).where(inArray(offices.code, body.officeCodes));
  }

  const result = await auth.api.signUpEmail({ body: { email: body.email, password: body.password, name: body.name } });
  if (!result?.user?.id) return { ok: false, reason: 'sign-up-failed' };

  try {
    await db.transaction(async (tx) => {
      const userPatch: Partial<typeof users.$inferInsert> = {};
      if (body.status) userPatch.status = body.status;
      if (Object.keys(userPatch).length > 0) {
        await tx.update(users).set(userPatch).where(eq(users.id, result.user.id));
      }
      if (roleRows.length > 0) {
        await tx.insert(userRoles).values(roleRows.map((r) => ({ userId: result.user.id, roleId: r.id })));
      }
      if (officeRows.length > 0) {
        await tx.insert(userOffices).values(officeRows.map((o) => ({ userId: result.user.id, officeId: o.id })));
      }
    });
  } catch (err) {
    try { await db.delete(users).where(eq(users.id, result.user.id)); } catch { /* swallow */ }
    throw err;
  }

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'users', entityId: result.user.id,
    action: 'create',
    after: { email: body.email, name: body.name, roles: roleRows.map((r) => r.code).sort(), offices: officeRows.map((o) => o.code).sort() },
    summary: `Created user ${body.email}`,
    metadata: actorMetadata(actor),
  });

  const profile = await loadUserProfile(result.user.id);
  return { ok: true, payload: profile! };
}

// ── UPDATE ───────────────────────────────────────────────────
export type UpdateUserResult =
  | { ok: true; payload: ReturnType<typeof toUserResponse> }
  | { ok: false; reason: 'no-fields' }
  | { ok: false; reason: 'not-found' };

export async function updateUser(
  id: string,
  body: { name?: string; image?: string | null; status?: string },
  actor: Actor,
): Promise<UpdateUserResult> {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.image !== undefined) patch.image = body.image;
  if (body.status !== undefined) patch.status = body.status;

  if (Object.keys(patch).length === 0) return { ok: false, reason: 'no-fields' };

  const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!before) return { ok: false, reason: 'not-found' };

  const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  if (!updated) return { ok: false, reason: 'not-found' };

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'users', entityId: id,
    action: 'update',
    before: { name: before.name, status: before.status },
    after: { name: updated.name, status: updated.status },
    summary: `Updated user ${updated.email}`,
    metadata: actorMetadata(actor),
  });

  return { ok: true, payload: toUserResponse(updated) };
}

// ── SOFT DELETE ──────────────────────────────────────────────
export type SoftDeleteResult = { ok: true } | { ok: false; reason: 'self' } | { ok: false; reason: 'not-found' };

export async function softDeleteUser(id: string, actor: Actor): Promise<SoftDeleteResult> {
  if (actor.id === id) return { ok: false, reason: 'self' };

  const res = await db.update(users).set({ deletedAt: new Date(), deletedBy: actor.id }).where(and(eq(users.id, id), isNull(users.deletedAt))).returning();
  if (res.length === 0) return { ok: false, reason: 'not-found' };

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'users', entityId: id,
    action: 'soft-delete', summary: `Soft-deleted user ${res[0].email}`,
    metadata: actorMetadata(actor),
  });

  return { ok: true };
}

// ── RESTORE ──────────────────────────────────────────────────
export type RestoreUserResult =
  | { ok: true; payload: NonNullable<Awaited<ReturnType<typeof loadUserProfile>>> }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'not-deleted' };

export async function restoreUser(id: string, actor: Actor): Promise<RestoreUserResult> {
  const [existing] = await db.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return { ok: false, reason: 'not-found' };
  if (existing.deletedAt === null) return { ok: false, reason: 'not-deleted' };

  await db.update(users).set({ deletedAt: null, deletedBy: null }).where(eq(users.id, id));

  const profile = await loadUserProfile(id);
  if (!profile) return { ok: false, reason: 'not-found' };

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'users', entityId: id,
    action: 'restore', summary: `Restored user ${profile.email}`,
    metadata: actorMetadata(actor),
  });

  return { ok: true, payload: profile };
}

// ── REPLACE ROLES ────────────────────────────────────────────
export type SetUserRolesResult =
  | { ok: true; userId: string; roles: string[] }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unknown-roles'; missing: string[] };

export async function setUserRoles(
  id: string,
  body: { roleCodes: string[] },
  actor: Actor,
): Promise<SetUserRolesResult> {
  const { roleCodes } = body;

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return { ok: false, reason: 'not-found' };

  let roleRows: { id: string; code: string }[] = [];
  if (roleCodes.length > 0) {
    roleRows = await db.select({ id: roles.id, code: roles.code }).from(roles).where(inArray(roles.code, roleCodes));
    const found = new Set(roleRows.map((r) => r.code));
    const missing = roleCodes.filter((c) => !found.has(c));
    if (missing.length > 0) return { ok: false, reason: 'unknown-roles', missing };
  }

  const beforeRoles = await db.select({ code: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id));

  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, id));
    if (roleRows.length > 0) {
      await tx.insert(userRoles).values(roleRows.map((r) => ({ userId: id, roleId: r.id })));
    }
  });

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'users', entityId: id,
    action: 'assign-roles',
    before: { roles: beforeRoles.map((r) => r.code).sort() },
    after: { roles: roleRows.map((r) => r.code).sort() },
    summary: `Set roles for ${user.email}`,
    metadata: actorMetadata(actor),
  });

  return { ok: true, userId: id, roles: roleRows.map((r) => r.code).sort() };
}
