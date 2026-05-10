import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { type AuthedContext, requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { validationHook } from '../../middleware/validation-hook';
import { actorFromContext } from '../../lib/actor';
import {
  createOfficeBody, errorResponse, listOfficesQuery, officeCoreSchema,
  officeDetailSchema, officeListResponseSchema, setMembersBody, updateOfficeBody,
} from './schemas';
import { createOffice, deleteOffice, getOfficeDetail, listOffices, setOfficeMembers, updateOffice } from './service';

export const officesRoutes = new OpenAPIHono<AuthedContext>({ defaultHook: validationHook });

officesRoutes.use('/api/offices/*', requireAuth);

// ── LIST ─────────────────────────────────────────────────────
officesRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/offices', tags: ['Offices'],
    request: { query: listOfficesQuery },
    responses: { 200: { description: 'Paginated offices', content: { 'application/json': { schema: officeListResponseSchema } } } },
    middleware: [requirePermission('office:read')],
  }),
  async (c) => {
    const query = c.req.valid('query');
    const officeIds = c.get('officeIds');
    const result = await listOffices({
      ...query,
      scopeOfficeIds: officeIds.length > 0 ? officeIds : undefined,
    });
    return c.json(result, 200);
  },
);

// ── GET ──────────────────────────────────────────────────────
officesRoutes.openapi(
  createRoute({
    method: 'get', path: '/api/offices/{id}', tags: ['Offices'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'Office detail', content: { 'application/json': { schema: officeDetailSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('office:read')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const officeIds = c.get('officeIds');
    if (officeIds.length > 0 && !officeIds.includes(id)) {
      return c.json({ error: 'Office not found' }, 404);
    }
    const office = await getOfficeDetail(id);
    if (!office) return c.json({ error: 'Office not found' }, 404);
    return c.json(office, 200);
  },
);

// ── CREATE ───────────────────────────────────────────────────
officesRoutes.openapi(
  createRoute({
    method: 'post', path: '/api/offices', tags: ['Offices'],
    request: { body: { content: { 'application/json': { schema: createOfficeBody } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: officeDetailSchema } } },
      409: { description: 'Code exists', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('office:create')],
  }),
  async (c) => {
    const body = c.req.valid('json');
    const result = await createOffice(body, actorFromContext(c));
    if (result.kind === 'conflict') return c.json({ error: `Office '${result.code}' already exists` }, 409);
    return c.json(result.office, 201);
  },
);

// ── UPDATE ───────────────────────────────────────────────────
officesRoutes.openapi(
  createRoute({
    method: 'patch', path: '/api/offices/{id}', tags: ['Offices'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: updateOfficeBody } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: officeCoreSchema } } },
      400: { description: 'No fields', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('office:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await updateOffice(id, body, actorFromContext(c));
    if (result.kind === 'no-fields') return c.json({ error: 'No fields to update' }, 400);
    if (result.kind === 'not-found') return c.json({ error: 'Office not found' }, 404);
    return c.json(result.office, 200);
  },
);

// ── DELETE ───────────────────────────────────────────────────
officesRoutes.openapi(
  createRoute({
    method: 'delete', path: '/api/offices/{id}', tags: ['Offices'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: 'Deleted' },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('office:delete')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await deleteOffice(id, actorFromContext(c));
    if (!result) return c.json({ error: 'Office not found' }, 404);
    return c.body(null, 204);
  },
);

// ── SET MEMBERS ─────────────────────────────────────────────
officesRoutes.openapi(
  createRoute({
    method: 'put', path: '/api/offices/{id}/members', tags: ['Offices'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: setMembersBody } } },
    },
    responses: {
      200: { description: 'Members updated', content: { 'application/json': { schema: officeDetailSchema } } },
      400: { description: 'Unknown user(s)', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Office not found', content: { 'application/json': { schema: errorResponse } } },
    },
    middleware: [requirePermission('office:update')],
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await setOfficeMembers(id, body, actorFromContext(c));
    if (result.kind === 'not-found') return c.json({ error: 'Office not found' }, 404);
    if (result.kind === 'unknown-users') return c.json({ error: `Unknown users: ${result.missing.join(', ')}` }, 400);
    return c.json(result.office, 200);
  },
);
