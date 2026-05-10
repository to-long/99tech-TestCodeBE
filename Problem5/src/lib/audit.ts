import { db } from '../db/client';
import { auditLogs } from '../db/schema/audit';

export interface AuditWriteParams {
  actorUserId: string;
  entitySchema: string;
  entityTable: string;
  entityId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(params: AuditWriteParams): Promise<number | null> {
  try {
    if (params.before != null && params.after != null) {
      const diffs = computeDiffs(params.before, params.after);
      if (diffs.length === 0) return null;
    }

    const metadata: Record<string, unknown> = {
      status: 'success',
      ...(params.summary ? { summary: params.summary } : {}),
      ...(params.before ? { before: params.before } : {}),
      ...(params.after ? { after: params.after } : {}),
      ...(params.metadata ?? {}),
    };

    const [inserted] = await db
      .insert(auditLogs)
      .values({
        actorUserId: params.actorUserId,
        entitySchema: params.entitySchema,
        entityTable: params.entityTable,
        entityId: params.entityId ?? null,
        action: params.action,
        metadata,
      })
      .returning({ id: auditLogs.id });

    return inserted.id;
  } catch (err) {
    console.error('[audit] writeAudit failed:', err);
    return null;
  }
}

function computeDiffs(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ field: k, oldValue: a ?? null, newValue: b ?? null });
    }
  }
  return out;
}
