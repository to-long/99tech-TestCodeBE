import { eq, ilike, inArray, or, sql as dsql } from 'drizzle-orm';
import { db } from '../../db/client';
import { permissions, rolePermissions, roles } from '../../db/schema/iam';
import { writeAudit } from '../../lib/audit';
import type { Actor } from '../../lib/actor';
import { actorMetadata } from '../../lib/actor';

type RoleSelect = typeof roles.$inferSelect;

function toCoreResponse(r: RoleSelect, grantCount: number) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    grantCount,
  };
}

function toDetailResponse(r: RoleSelect, grantCount: number, permissionCodes: string[]) {
  return { ...toCoreResponse(r, grantCount), permissions: permissionCodes };
}

// ── LIST ─────────────────────────────────────────────────────
export async function listRoles(f: {
  q?: string;
  includePermissions: boolean;
  page: number;
  pageSize: number;
}) {
  const offset = (f.page - 1) * f.pageSize;
  const whereExpr = f.q
    ? or(ilike(roles.code, `%${f.q}%`), ilike(roles.name, `%${f.q}%`))
    : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: roles.id, code: roles.code, name: roles.name,
        description: roles.description, createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
        grantCount: dsql<number>`CAST(count(${rolePermissions.permissionId}) AS INT)`,
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(whereExpr)
      .groupBy(roles.id)
      .orderBy(roles.name)
      .limit(f.pageSize)
      .offset(offset),
    db.select({ count: dsql<number>`CAST(count(*) AS INT)` }).from(roles).where(whereExpr),
  ]);

  const roleIds = rows.map((r) => r.id);
  const permsByRoleId = new Map<string, string[]>();
  if (f.includePermissions && roleIds.length > 0) {
    const pairs = await db
      .select({ roleId: rolePermissions.roleId, code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleIds))
      .orderBy(permissions.code);
    for (const p of pairs) {
      const list = permsByRoleId.get(p.roleId) ?? [];
      list.push(p.code);
      permsByRoleId.set(p.roleId, list);
    }
  }

  return {
    items: rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      grantCount: Number(r.grantCount),
      permissions: f.includePermissions ? (permsByRoleId.get(r.id) ?? []) : [],
    })),
    total: Number(countRows[0].count),
    page: f.page,
    pageSize: f.pageSize,
  };
}

// ── DETAIL ───────────────────────────────────────────────────
export async function getRoleDetail(id: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) return null;

  const grantedPerms = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, id))
    .orderBy(permissions.code);

  return toDetailResponse(role, grantedPerms.length, grantedPerms.map((p) => p.code));
}

// ── CREATE ───────────────────────────────────────────────────
export type CreateRoleResult =
  | { kind: 'ok'; role: ReturnType<typeof toDetailResponse> }
  | { kind: 'conflict'; code: string }
  | { kind: 'unknown-permissions'; missing: string[] };

export async function createRole(
  input: { code: string; name: string; description?: string; permissionCodes?: string[] },
  actor: Actor,
): Promise<CreateRoleResult> {
  const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, input.code)).limit(1);
  if (existing) return { kind: 'conflict', code: input.code };

  let grants: { roleId: string; permissionId: string }[] = [];
  if (input.permissionCodes?.length) {
    const found = await db.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, input.permissionCodes));
    const foundCodes = new Set(found.map((p) => p.code));
    const missing = input.permissionCodes.filter((c) => !foundCodes.has(c));
    if (missing.length > 0) return { kind: 'unknown-permissions', missing };
    grants = found.map((p) => ({ roleId: '<pending>', permissionId: p.id }));
  }

  const [role] = await db.insert(roles).values({ code: input.code, name: input.name, description: input.description }).returning();

  if (grants.length > 0) {
    await db.insert(rolePermissions).values(grants.map((g) => ({ roleId: role.id, permissionId: g.permissionId })));
  }

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'roles', entityId: role.id,
    action: 'create',
    after: { code: role.code, name: role.name, description: role.description, permissions: (input.permissionCodes ?? []).slice().sort() },
    summary: `Created role ${role.code}`,
    metadata: actorMetadata(actor),
  });

  return { kind: 'ok', role: toDetailResponse(role, grants.length, input.permissionCodes ?? []) };
}

// ── UPDATE ───────────────────────────────────────────────────
export async function updateRole(
  id: string,
  input: { name?: string; description?: string | null },
  actor: Actor,
) {
  const [before] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!before) return null;

  const [role] = await db.update(roles).set(input).where(eq(roles.id, id)).returning();
  if (!role) return null;

  const [{ count }] = await db.select({ count: dsql<number>`CAST(count(*) AS INT)` }).from(rolePermissions).where(eq(rolePermissions.roleId, id));

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'roles', entityId: id,
    action: 'update',
    before: { code: before.code, name: before.name, description: before.description },
    after: { code: role.code, name: role.name, description: role.description },
    summary: `Updated role ${role.code}`,
    metadata: actorMetadata(actor),
  });

  return toCoreResponse(role, Number(count));
}

// ── DELETE ───────────────────────────────────────────────────
export async function deleteRole(id: string, actor: Actor) {
  const res = await db.delete(roles).where(eq(roles.id, id)).returning();
  if (res.length === 0) return null;

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'roles', entityId: id,
    action: 'delete', summary: `Deleted role ${res[0].code}`,
    metadata: actorMetadata(actor),
  });

  return { deleted: true };
}

// ── REPLACE PERMISSIONS ──────────────────────────────────────
export type SetRolePermissionsResult =
  | { kind: 'ok'; role: ReturnType<typeof toDetailResponse> }
  | { kind: 'not-found' }
  | { kind: 'unknown-permissions'; missing: string[] };

export async function setRolePermissions(
  id: string,
  input: { permissionCodes: string[] },
  actor: Actor,
): Promise<SetRolePermissionsResult> {
  const { permissionCodes } = input;

  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) return { kind: 'not-found' };

  let permIds: { id: string; code: string }[] = [];
  if (permissionCodes.length > 0) {
    permIds = await db.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, permissionCodes));
    const found = new Set(permIds.map((p) => p.code));
    const missing = permissionCodes.filter((c) => !found.has(c));
    if (missing.length > 0) return { kind: 'unknown-permissions', missing };
  }

  const beforePerms = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, id));

  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (permIds.length > 0) {
      await tx.insert(rolePermissions).values(permIds.map((p) => ({ roleId: id, permissionId: p.id })));
    }
  });

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'roles', entityId: id,
    action: 'assign-permissions',
    before: { permissions: beforePerms.map((p) => p.code).sort() },
    after: { permissions: permIds.map((p) => p.code).sort() },
    summary: `Set permissions for role ${role.code}`,
    metadata: actorMetadata(actor),
  });

  return { kind: 'ok', role: toDetailResponse(role, permIds.length, permIds.map((p) => p.code).sort()) };
}
