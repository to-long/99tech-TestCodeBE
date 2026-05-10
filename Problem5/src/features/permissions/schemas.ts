import { z } from '@hono/zod-openapi';

export const permissionSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Permission');

export const createPermissionBody = z
  .object({
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    description: z.string().max(500).nullable().optional(),
  })
  .openapi('CreatePermissionBody');

export const updatePermissionBody = z
  .object({
    code: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .openapi('UpdatePermissionBody');

export const errorResponse = z.object({ error: z.string() }).openapi('PermissionError');
