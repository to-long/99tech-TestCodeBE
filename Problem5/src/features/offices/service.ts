import { and, desc, eq, ilike, inArray, sql as dsql } from 'drizzle-orm';
import { db } from '../../db/client';
import { writeAudit } from '../../lib/audit';
import type { Actor } from '../../lib/actor';
import { actorMetadata } from '../../lib/actor';
import { offices, roles, userOffices, userRoles, users } from '../../db/schema/iam';

type OfficeSelect = typeof offices.$inferSelect;

function toOfficeResponse(o: OfficeSelect, memberCount: number) {
  return {
    id: o.id,
    code: o.code,
    name: o.name,
    address: o.address ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    memberCount,
  };
}

// ── LIST ─────────────────────────────────────────────────────
export async function listOffices(query: {
  page?: string; pageSize?: string; q?: string;
  scopeOfficeIds?: string[];
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const whereClauses = [];
  if (query.scopeOfficeIds) {
    whereClauses.push(inArray(offices.id, query.scopeOfficeIds));
  }
  if (query.q) {
    whereClauses.push(ilike(offices.name, `%${query.q}%`));
  }
  const whereExpr = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const [rows, countRows] = await Promise.all([
    db.select().from(offices).where(whereExpr).orderBy(desc(offices.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: dsql<number>`CAST(count(*) AS INT)` }).from(offices).where(whereExpr),
  ]);

  const officeIds = rows.map((o) => o.id);
  const memberCounts = officeIds.length
    ? await db
        .select({ officeId: userOffices.officeId, count: dsql<number>`CAST(count(*) AS INT)` })
        .from(userOffices)
        .where(inArray(userOffices.officeId, officeIds))
        .groupBy(userOffices.officeId)
    : [];
  const countMap = new Map(memberCounts.map((r) => [r.officeId, r.count]));

  return {
    items: rows.map((o) => toOfficeResponse(o, countMap.get(o.id) ?? 0)),
    total: Number(countRows[0].count),
    page,
    pageSize,
  };
}

// ── DETAIL ──────────────────────────────────────────────────
export async function getOfficeDetail(id: string) {
  const [office] = await db.select().from(offices).where(eq(offices.id, id)).limit(1);
  if (!office) return null;

  const members = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(userOffices)
    .innerJoin(users, eq(users.id, userOffices.userId))
    .where(eq(userOffices.officeId, id))
    .orderBy(users.name);

  const memberIds = members.map((m) => m.id);
  const rolePairs = memberIds.length
    ? await db
        .select({ userId: userRoles.userId, code: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(userRoles.userId, memberIds))
    : [];
  const rolesByUserId = new Map<string, string[]>();
  for (const pair of rolePairs) {
    const list = rolesByUserId.get(pair.userId) ?? [];
    list.push(pair.code);
    rolesByUserId.set(pair.userId, list);
  }

  return {
    ...toOfficeResponse(office, members.length),
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      roles: (rolesByUserId.get(m.id) ?? []).sort(),
    })),
  };
}

// ── CREATE ──────────────────────────────────────────────────
export type CreateOfficeResult =
  | { kind: 'ok'; office: NonNullable<Awaited<ReturnType<typeof getOfficeDetail>>> }
  | { kind: 'conflict'; code: string };

export async function createOffice(
  body: { code: string; name: string; address?: string | null },
  actor: Actor,
): Promise<CreateOfficeResult> {
  const [existing] = await db.select({ id: offices.id }).from(offices).where(eq(offices.code, body.code)).limit(1);
  if (existing) return { kind: 'conflict', code: body.code };

  const [inserted] = await db
    .insert(offices)
    .values({ code: body.code, name: body.name, address: body.address ?? null })
    .returning();

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'offices', entityId: inserted.id,
    action: 'create',
    after: { code: body.code, name: body.name },
    summary: `Created office ${body.name}`,
    metadata: actorMetadata(actor),
  });

  const detail = await getOfficeDetail(inserted.id);
  return { kind: 'ok', office: detail! };
}

// ── UPDATE ──────────────────────────────────────────────────
export type UpdateOfficeResult =
  | { kind: 'ok'; office: ReturnType<typeof toOfficeResponse> }
  | { kind: 'not-found' }
  | { kind: 'no-fields' };

export async function updateOffice(
  id: string,
  body: { code?: string; name?: string; address?: string | null },
  actor: Actor,
): Promise<UpdateOfficeResult> {
  const patch: Partial<typeof offices.$inferInsert> = {};
  if (body.code !== undefined) patch.code = body.code;
  if (body.name !== undefined) patch.name = body.name;
  if (body.address !== undefined) patch.address = body.address;
  if (Object.keys(patch).length === 0) return { kind: 'no-fields' };

  const [before] = await db.select().from(offices).where(eq(offices.id, id)).limit(1);
  if (!before) return { kind: 'not-found' };

  patch.updatedAt = new Date();
  const [updated] = await db.update(offices).set(patch).where(eq(offices.id, id)).returning();

  const [memberCount] = await db
    .select({ count: dsql<number>`CAST(count(*) AS INT)` })
    .from(userOffices)
    .where(eq(userOffices.officeId, id));

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'offices', entityId: id,
    action: 'update',
    before: { code: before.code, name: before.name },
    after: { code: updated.code, name: updated.name },
    summary: `Updated office ${updated.name}`,
    metadata: actorMetadata(actor),
  });

  return { kind: 'ok', office: toOfficeResponse(updated, memberCount.count) };
}

// ── DELETE ──────────────────────────────────────────────────
export async function deleteOffice(id: string, actor: Actor): Promise<boolean> {
  const [office] = await db.select().from(offices).where(eq(offices.id, id)).limit(1);
  if (!office) return false;

  await db.delete(offices).where(eq(offices.id, id));

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'offices', entityId: id,
    action: 'delete',
    before: { code: office.code, name: office.name },
    summary: `Deleted office ${office.name}`,
    metadata: actorMetadata(actor),
  });

  return true;
}

// ── SET MEMBERS ─────────────────────────────────────────────
export type SetMembersResult =
  | { kind: 'ok'; office: NonNullable<Awaited<ReturnType<typeof getOfficeDetail>>> }
  | { kind: 'not-found' }
  | { kind: 'unknown-users'; missing: string[] };

export async function setOfficeMembers(
  id: string,
  body: { userIds: string[] },
  actor: Actor,
): Promise<SetMembersResult> {
  const [office] = await db.select().from(offices).where(eq(offices.id, id)).limit(1);
  if (!office) return { kind: 'not-found' };

  if (body.userIds.length > 0) {
    const foundUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, body.userIds));
    const foundSet = new Set(foundUsers.map((u) => u.id));
    const missing = body.userIds.filter((uid) => !foundSet.has(uid));
    if (missing.length > 0) return { kind: 'unknown-users', missing };
  }

  await db.transaction(async (tx) => {
    await tx.delete(userOffices).where(eq(userOffices.officeId, id));
    if (body.userIds.length > 0) {
      await tx.insert(userOffices).values(body.userIds.map((uid) => ({ userId: uid, officeId: id })));
    }
  });

  await writeAudit({
    actorUserId: actor.id, entitySchema: 'iam', entityTable: 'offices', entityId: id,
    action: 'set-members',
    after: { userIds: body.userIds },
    summary: `Set members for office ${office.name}`,
    metadata: actorMetadata(actor),
  });

  const detail = await getOfficeDetail(id);
  return { kind: 'ok', office: detail! };
}

// ── HELPER: check if user is in scope ───────────────────────
export async function isUserInOfficeScope(
  targetUserId: string,
  scopeOfficeIds: string[],
): Promise<boolean> {
  if (scopeOfficeIds.length === 0) return true; // no scope = global
  const [match] = await db
    .select({ officeId: userOffices.officeId })
    .from(userOffices)
    .where(and(eq(userOffices.userId, targetUserId), inArray(userOffices.officeId, scopeOfficeIds)))
    .limit(1);
  return !!match;
}
