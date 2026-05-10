import { z } from '@hono/zod-openapi';

export const roleCoreSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    grantCount: z.number().int(),
  })
  .openapi('Role');

export const roleDetailSchema = roleCoreSchema
  .extend({ permissions: z.array(z.string()) })
  .openapi('RoleDetail');

export const roleListResponseSchema = z.object({
  items: z.array(roleDetailSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const createRoleBody = z
  .object({
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    permissionCodes: z.array(z.string()).optional(),
  })
  .openapi('CreateRoleBody');

export const updateRoleBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .openapi('UpdateRoleBody');

export const setPermissionsBody = z
  .object({
    permissionCodes: z.array(z.string()),
  })
  .openapi('SetRolePermissionsBody');

export const rolesListQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  q: z.string().optional(),
  includePermissions: z.string().optional(),
});

export const errorResponse = z.object({ error: z.string() }).openapi('Error');
