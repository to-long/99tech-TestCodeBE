import { z } from '@hono/zod-openapi';

export const userCoreSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    image: z.string().nullable(),
    emailVerified: z.boolean(),
    status: z.enum(['active', 'inactive', 'locked']),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
    roles: z.array(z.string()),
  })
  .openapi('User');

export const userDetailSchema = userCoreSchema
  .extend({ permissions: z.array(z.string()) })
  .openapi('UserDetail');

export const userListResponseSchema = z.object({
  items: z.array(userCoreSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const createUserBody = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1).max(200),
    status: z.enum(['active', 'inactive', 'locked']).optional(),
    roleCodes: z.array(z.string()).optional(),
  })
  .openapi('CreateUserBody');

export const updateUserBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    image: z.string().nullable().optional(),
    status: z.enum(['active', 'inactive', 'locked']).optional(),
  })
  .openapi('UpdateUserBody');

export const setRolesBody = z
  .object({ roleCodes: z.array(z.string()) })
  .openapi('SetUserRolesBody');

export const setRolesResponseSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(z.string()),
});

export const listUsersQuery = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  q: z.string().optional(),
  includeDeleted: z.string().optional(),
});

export const errorResponse = z.object({ error: z.string() }).openapi('UserError');
