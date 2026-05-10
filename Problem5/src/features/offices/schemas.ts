import { z } from '@hono/zod-openapi';

export const officeCoreSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    address: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    memberCount: z.number().int(),
  })
  .openapi('Office');

export const officeDetailSchema = officeCoreSchema
  .extend({
    members: z.array(
      z.object({
        id: z.string().uuid(),
        email: z.string(),
        name: z.string(),
        roles: z.array(z.string()),
      }),
    ),
  })
  .openapi('OfficeDetail');

export const officeListResponseSchema = z.object({
  items: z.array(officeCoreSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const createOfficeBody = z
  .object({
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    address: z.string().max(500).nullable().optional(),
  })
  .openapi('CreateOfficeBody');

export const updateOfficeBody = z
  .object({
    code: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(200).optional(),
    address: z.string().max(500).nullable().optional(),
  })
  .openapi('UpdateOfficeBody');

export const setMembersBody = z
  .object({ userIds: z.array(z.string().uuid()) })
  .openapi('SetOfficeMembersBody');

export const listOfficesQuery = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  q: z.string().optional(),
});

export const errorResponse = z.object({ error: z.string() }).openapi('OfficeError');
