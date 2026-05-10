import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { type AuthedContext, requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { validationHook } from '../../middleware/validation-hook';
import { actorFromContext } from '../../lib/actor';
import {
  createUserBody, errorResponse, listUsersQuery, setRolesBody,
  setRolesResponseSchema, updateUserBody, userCoreSchema, userDetailSchema,
  userListResponseSchema,
} from './schemas';
import {
  createUser, listUsers, loadUserProfile, restoreUser,
  setUserRoles, softDeleteUser, updateUser,
} from './service';

export const usersRoutes = new OpenAPIHono<AuthedContext>({ defaultHook: validationHook });

usersRoutes.use('/api/users/*', requireAuth);

// ── LIST ─────────────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/users', tags: ['Users'],
    request: { query: listUsersQuery },
    responses: { 200: { description: 'Paginated users', content: { 'application/json': { schema: userListResponseSchema } } } },
    middleware: [requirePermission('user:read')],
  }),
  async (c) => {
    const result = await listUsers(c.req.valid('query'));
    return c.json(result, 200);
  },
);

// ── GET /me ──────────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/users/me', tags: ['Users'],
    responses: {
      200: { description: 'Current user', content: { 'application/json': { schema: userDetailSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
  }),
  async (c) => {
    const profile = await loadUserProfile(c.get('user').id);
    if (!profile) return c.json({ error: 'User not found' }, 404);
    return c.json(profile, 200);
  },
);

// ── GET /:id ─────────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/users/{id}', tags: ['Users'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'User detail', content: { 'application/json': { schema: userDetailSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('user:read')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const profile = await loadUserProfile(id);
    if (!profile) return c.json({ error: 'User not found' }, 404);
    return c.json(profile, 200);
  },
);

// ── CREATE ───────────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'post', path: '/api/users', tags: ['Users'],
    request: { body: { content: { 'application/json': { schema: createUserBody } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: userDetailSchema } } },
      400: { description: 'Unknown role(s)', content: { 'application/json': { schema: errorResponse } } },
      409: { description: 'Email exists', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('user:create')],
  }),
  async (c) => {
    const body = c.req.valid('json');
    const result = await createUser(body, actorFromContext(c));
    if (!result.ok) {
      switch (result.reason) {
        case 'email-exists': return c.json({ error: `Email '${result.email}' already exists` }, 409);
        case 'unknown-roles': return c.json({ error: `Unknown roles: ${result.missing.join(', ')}` }, 400);
        case 'sign-up-failed': return c.json({ error: 'Sign-up failed' }, 409);
      }
    }
    return c.json(result.payload, 201);
  },
);

// ── UPDATE ───────────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'patch', path: '/api/users/{id}', tags: ['Users'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: updateUserBody } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: userCoreSchema } } },
      400: { description: 'Bad request', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('user:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await updateUser(id, body, actorFromContext(c));
    if (!result.ok) {
      if (result.reason === 'no-fields') return c.json({ error: 'No fields to update' }, 400);
      return c.json({ error: 'User not found' }, 404);
    }
    return c.json(result.payload, 200);
  },
);

// ── SOFT DELETE ──────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'delete', path: '/api/users/{id}', tags: ['Users'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: 'Soft-deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
      400: { description: 'Cannot delete self', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('user:delete')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await softDeleteUser(id, actorFromContext(c));
    if (!result.ok) {
      if (result.reason === 'self') return c.json({ error: 'Cannot delete yourself' }, 400);
      return c.json({ error: 'User not found' }, 404);
    }
    return c.body(null, 204);
  },
);

// ── RESTORE ──────────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'post', path: '/api/users/{id}/restore', tags: ['Users'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'Restored', content: { 'application/json': { schema: userDetailSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
      409: { description: 'Not deleted', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('user:delete')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await restoreUser(id, actorFromContext(c));
    if (!result.ok) {
      if (result.reason === 'not-deleted') return c.json({ error: 'User is not deleted' }, 409);
      return c.json({ error: 'User not found' }, 404);
    }
    return c.json(result.payload, 200);
  },
);

// ── REPLACE ROLES ────────────────────────────────────────────
usersRoutes.openapi(
  createRoute({
    method: 'put', path: '/api/users/{id}/roles', tags: ['Users'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: setRolesBody } } },
    },
    responses: {
      200: { description: 'Roles updated', content: { 'application/json': { schema: setRolesResponseSchema } } },
      400: { description: 'Unknown role(s)', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'User not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('user:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await setUserRoles(id, body, actorFromContext(c));
    if (!result.ok) {
      if (result.reason === 'unknown-roles') return c.json({ error: `Unknown roles: ${result.missing.join(', ')}` }, 400);
      return c.json({ error: 'User not found' }, 404);
    }
    return c.json({ userId: result.userId, roles: result.roles }, 200);
  },
);
