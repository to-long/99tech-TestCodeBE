import {
  bigserial,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './iam';

export const auditSchema = pgSchema('audit');

export const auditLogs = auditSchema.table('audit_logs', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  entitySchema: text('entity_schema').notNull(),
  entityTable: text('entity_table').notNull(),
  entityId: text('entity_id'),
  action: text().notNull(),
  metadata: jsonb(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
