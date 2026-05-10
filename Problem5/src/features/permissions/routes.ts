import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { type AuthedContext, requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { validationHook } from '../../middleware/validation-hook';
import { actorFromContext } from '../../lib/actor';
import { createPermissionBody, errorResponse, permissionSchema, updatePermissionBody } from './schemas';
import { createPermission, deletePermission, getPermission, listPermissions, toRowResponse, updatePermission } from './service';

export const permissionsRoutes = new OpenAPIHono<AuthedContext>({ defaultHook: validationHook });

permissionsRoutes.use('/api/permissions/*', requireAuth);

// ── LIST ─────────────────────────────────────────────────────
permissionsRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/permissions', tags: ['Permissions'],
    responses: { 200: { description: 'All permissions', content: { 'application/json': { schema: z.array(permissionSchema) } } } },
    middleware: [requirePermission('permission:read')],
  }),
  async (c) => {
    const rows = await listPermissions();
    return c.json(rows.map((r) => toRowResponse(r)), 200);
  },
);

// ── GET ──────────────────────────────────────────────────────
permissionsRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/permissions/{id}', tags: ['Permissions'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'Permission', content: { 'application/json': { schema: permissionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('permission:read')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const row = await getPermission(id);
    if (!row) return c.json({ error: 'Permission not found' }, 404);
    return c.json(toRowResponse(row), 200);
  },
);

// ── CREATE ───────────────────────────────────────────────────
permissionsRoutes.openapi(
  createRoute({
    method: 'post', path: '/api/permissions', tags: ['Permissions'],
    request: { body: { content: { 'application/json': { schema: createPermissionBody } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: permissionSchema } } },
      409: { description: 'Code already exists', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('permission:create')],
  }),
  async (c) => {
    const body = c.req.valid('json');
    const result = await createPermission(body, actorFromContext(c));
    if (result.status === 'conflict') return c.json({ error: `Permission '${result.code}' already exists` }, 409);
    return c.json(toRowResponse(result.row), 201);
  },
);

// ── UPDATE ───────────────────────────────────────────────────
permissionsRoutes.openapi(
  createRoute({
    method: 'patch', path: '/api/permissions/{id}', tags: ['Permissions'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: updatePermissionBody } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: permissionSchema } } },
      400: { description: 'Bad request', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('permission:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await updatePermission(id, body, actorFromContext(c));
    if (result.status === 'no-fields') return c.json({ error: 'No fields to update' }, 400);
    if (result.status === 'not-found') return c.json({ error: 'Permission not found' }, 404);
    return c.json(toRowResponse(result.row), 200);
  },
);

// ── DELETE ───────────────────────────────────────────────────
permissionsRoutes.openapi(
  createRoute({
    method: 'delete', path: '/api/permissions/{id}', tags: ['Permissions'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('permission:delete')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await deletePermission(id, actorFromContext(c));
    if (result.status === 'not-found') return c.json({ error: 'Permission not found' }, 404);
    return c.body(null, 204);
  },
);
