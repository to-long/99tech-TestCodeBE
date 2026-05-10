import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './db/drizzle',
  schemaFilter: ['iam', 'audit'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5440/problem5',
  },
  verbose: true,
  strict: true,
  breakpoints: true,
});
