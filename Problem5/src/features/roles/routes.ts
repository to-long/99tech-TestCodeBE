import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { type AuthedContext, requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { validationHook } from '../../middleware/validation-hook';
import { actorFromContext } from '../../lib/actor';
import { parseBoolFlag } from '../../lib/query-flags';
import {
  createRoleBody, errorResponse, roleCoreSchema, roleDetailSchema,
  roleListResponseSchema, rolesListQuerySchema, setPermissionsBody, updateRoleBody,
} from './schemas';
import { createRole, deleteRole, getRoleDetail, listRoles, setRolePermissions, updateRole } from './service';

export const rolesRoutes = new OpenAPIHono<AuthedContext>({ defaultHook: validationHook });

rolesRoutes.use('/api/roles/*', requireAuth);

// ── LIST ─────────────────────────────────────────────────────
rolesRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/roles', tags: ['Roles'],
    request: { query: rolesListQuerySchema },
    responses: { 200: { description: 'Paginated roles', content: { 'application/json': { schema: roleListResponseSchema } } } },
    middleware: [requirePermission('role:read')],
  }),
  async (c) => {
    const { page: pageStr, pageSize: pageSizeStr, q, includePermissions } = c.req.valid('query');
    const page = Math.max(1, Number(pageStr) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20));
    const result = await listRoles({ q, includePermissions: parseBoolFlag(includePermissions), page, pageSize });
    return c.json(result, 200);
  },
);

// ── GET ──────────────────────────────────────────────────────
rolesRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/roles/{id}', tags: ['Roles'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'Role detail', content: { 'application/json': { schema: roleDetailSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('role:read')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const role = await getRoleDetail(id);
    if (!role) return c.json({ error: 'Role not found' }, 404);
    return c.json(role, 200);
  },
);

// ── CREATE ───────────────────────────────────────────────────
rolesRoutes.openapi(
  createRoute({
    method: 'post', path: '/api/roles', tags: ['Roles'],
    request: { body: { content: { 'application/json': { schema: createRoleBody } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: roleDetailSchema } } },
      409: { description: 'Code exists', content: { 'application/json': { schema: errorResponse } } },
      400: { description: 'Bad permission code(s)', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('role:create')],
  }),
  async (c) => {
    const body = c.req.valid('json');
    const result = await createRole(body, actorFromContext(c));
    if (result.kind === 'conflict') return c.json({ error: `Role '${result.code}' already exists` }, 409);
    if (result.kind === 'unknown-permissions') return c.json({ error: `Unknown permissions: ${result.missing.join(', ')}` }, 400);
    return c.json(result.role, 201);
  },
);

// ── UPDATE ───────────────────────────────────────────────────
rolesRoutes.openapi(
  createRoute({
    method: 'patch', path: '/api/roles/{id}', tags: ['Roles'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: updateRoleBody } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: roleCoreSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('role:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const role = await updateRole(id, body, actorFromContext(c));
    if (!role) return c.json({ error: 'Role not found' }, 404);
    return c.json(role, 200);
  },
);

// ── DELETE ───────────────────────────────────────────────────
rolesRoutes.openapi(
  createRoute({
    method: 'delete', path: '/api/roles/{id}', tags: ['Roles'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('role:delete')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await deleteRole(id, actorFromContext(c));
    if (!result) return c.json({ error: 'Role not found' }, 404);
    return c.body(null, 204);
  },
);

// ── REPLACE PERMISSIONS ──────────────────────────────────────
rolesRoutes.openapi(
  createRoute({
    method: 'put', path: '/api/roles/{id}/permissions', tags: ['Roles'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: setPermissionsBody } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: roleDetailSchema } } },
      400: { description: 'Unknown permission code(s)', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Role not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('role:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await setRolePermissions(id, body, actorFromContext(c));
    if (result.kind === 'not-found') return c.json({ error: 'Role not found' }, 404);
    if (result.kind === 'unknown-permissions') return c.json({ error: `Unknown permissions: ${result.missing.join(', ')}` }, 400);
    return c.json(result.role, 200);
  },
);
