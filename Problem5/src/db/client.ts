import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5440/problem5';

export const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Db = typeof db;
