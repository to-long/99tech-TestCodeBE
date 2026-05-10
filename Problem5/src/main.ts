import { serve } from '@hono/node-server';
import { env } from './env';
import { app } from './app';
import { pool } from './db/client';

async function start() {
  await pool.query('SELECT 1');
  console.log('Postgres connection ready');
  console.log(`Server: http://localhost:${env.PORT}`);
  console.log(`API Reference: http://localhost:${env.PORT}/reference`);
  console.log(`OpenAPI JSON: http://localhost:${env.PORT}/doc`);
  console.log(`Auth: http://localhost:${env.PORT}/api/auth`);
  serve({ fetch: app.fetch, port: env.PORT });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
