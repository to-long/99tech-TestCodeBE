import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { permissions } from '../../db/schema/iam';
import { writeAudit } from '../../lib/audit';
import type { Actor } from '../../lib/actor';
import { actorMetadata } from '../../lib/actor';

type PermissionRow = typeof permissions.$inferSelect;

export function toRowResponse(r: PermissionRow) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listPermissions() {
  return db.select().from(permissions).orderBy(permissions.code);
}

export async function getPermission(id: string) {
  const [row] = await db.select().from(permissions).where(eq(permissions.id, id));
  return row ?? null;
}

export type CreatePermissionResult =
  | { status: 'created'; row: PermissionRow }
  | { status: 'conflict'; code: string };

export async function createPermission(
  input: { code: string; name: string; description?: string | null },
  actor: Actor,
): Promise<CreatePermissionResult> {
  const [existing] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, input.code)).limit(1);
  if (existing) return { status: 'conflict', code: input.code };

  const [row] = await db.insert(permissions).values({ code: input.code, name: input.name, description: input.description }).returning();

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'permissions', entityId: row.id,
    action: 'create',
    after: { code: row.code, name: row.name, description: row.description },
    summary: `Created permission ${row.code}`,
    metadata: actorMetadata(actor),
  });

  return { status: 'created', row };
}

export type UpdatePermissionResult =
  | { status: 'updated'; row: PermissionRow }
  | { status: 'not-found' }
  | { status: 'no-fields' };

export async function updatePermission(
  id: string,
  input: { code?: string; name?: string; description?: string | null },
  actor: Actor,
): Promise<UpdatePermissionResult> {
  if (Object.keys(input).length === 0) return { status: 'no-fields' };

  const [before] = await db.select().from(permissions).where(eq(permissions.id, id)).limit(1);
  if (!before) return { status: 'not-found' };

  const [row] = await db.update(permissions).set({ ...input, updatedAt: new Date() }).where(eq(permissions.id, id)).returning();
  if (!row) return { status: 'not-found' };

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'permissions', entityId: id,
    action: 'update',
    before: { code: before.code, name: before.name, description: before.description },
    after: { code: row.code, name: row.name, description: row.description },
    summary: `Updated permission ${row.code}`,
    metadata: actorMetadata(actor),
  });

  return { status: 'updated', row };
}

export type DeletePermissionResult = { status: 'deleted' } | { status: 'not-found' };

export async function deletePermission(id: string, actor: Actor): Promise<DeletePermissionResult> {
  const res = await db.delete(permissions).where(eq(permissions.id, id)).returning();
  if (res.length === 0) return { status: 'not-found' };

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'permissions', entityId: id,
    action: 'delete', summary: `Deleted permission ${res[0].code}`,
    metadata: actorMetadata(actor),
  });

  return { status: 'deleted' };
}
