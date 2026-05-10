import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get', path: '/', tags: ['General'], summary: 'Welcome',
    responses: { 200: { description: 'Success', content: { 'application/json': { schema: z.object({ message: z.string(), timestamp: z.string(), version: z.string() }) } } } },
  }),
  (c) => c.json({ message: 'Problem5 CRUD API', timestamp: new Date().toISOString(), version: '1.0.0' }),
);

app.openapi(
  createRoute({
    method: 'get', path: '/health', tags: ['General'], summary: 'Health check',
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ status: z.string() }) } } } },
  }),
  (c) => c.json({ status: 'ok' }),
);

export { app as generalRoutes };
