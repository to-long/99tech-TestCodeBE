import 'dotenv/config';
import { z } from '@hono/zod-openapi';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Frontend
  FE_URL: z.string().url().default('http://localhost:3030'),
  FE_PORT: z.coerce.number().int().optional(),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
