import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env';
import { auth } from './auth';
import { rateLimit } from './middleware/rate-limit';
import { validationHook } from './middleware/validation-hook';
import { generalRoutes } from './features/general/index';
import { officesRoutes } from './features/offices/index';
import { permissionsRoutes } from './features/permissions/index';
import { rolesRoutes } from './features/roles/index';
import { usersRoutes } from './features/users/index';

export const app = new OpenAPIHono({ defaultHook: validationHook });

app.use(
  '*',
  secureHeaders({
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginOpenerPolicy: 'same-origin',
    xPermittedCrossDomainPolicies: 'none',
    xXssProtection: '0',
  }),
);

app.use(
  '*',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: 'Payload too large' }, 413),
  }),
);

app.use(
  '*',
  cors({
    origin: [env.FE_URL],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.use('/api/auth/*', rateLimit({ keyPrefix: 'auth', limit: 10, windowMs: 60_000 }));

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.route('/', generalRoutes);
app.route('/', officesRoutes);
app.route('/', permissionsRoutes);
app.route('/', rolesRoutes);
app.route('/', usersRoutes);

if (env.NODE_ENV !== 'production') {
  app.doc('/doc', {
    openapi: '3.0.0',
    info: { title: 'Problem5 CRUD API', version: '1.0.0', description: 'User / Role / Permission management with RBAC' },
    servers: [{ url: `http://localhost:${env.PORT}`, description: 'Development' }],
  });

  app.get(
    '/reference',
    apiReference({ spec: { url: '/doc' }, pageTitle: 'Problem5 API Reference', theme: 'kepler' }),
  );
}

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
