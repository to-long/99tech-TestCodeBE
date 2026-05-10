import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './app';
import { pool } from './db/client';

const PORT = Number(process.env.PORT) || 8000;

async function start() {
  await pool.query('SELECT 1');
  console.log('Postgres connection ready');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`API Reference: http://localhost:${PORT}/reference`);
  console.log(`OpenAPI JSON: http://localhost:${PORT}/doc`);
  console.log(`Auth: http://localhost:${PORT}/api/auth`);
  serve({ fetch: app.fetch, port: PORT });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
