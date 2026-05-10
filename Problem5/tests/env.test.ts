import { describe, test, expect } from 'bun:test';
import { z } from '@hono/zod-openapi';

// Re-define the schema here to test it in isolation without triggering process.exit
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FE_URL: z.string().url().default('http://localhost:3030'),
  FE_PORT: z.coerce.number().int().optional(),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8000'),
});

describe('Environment Validation', () => {
  test('valid env passes', () => {
    const result = envSchema.safeParse({
      PORT: '8000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5440/test',
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.DATABASE_SSL).toBe(false);
    }
  });

  test('PORT must be a valid number', () => {
    const result = envSchema.safeParse({
      PORT: '99999',
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(false);
  });

  test('DATABASE_URL must start with postgresql://', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'mysql://localhost/test',
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(false);
  });

  test('missing DATABASE_URL fails', () => {
    const result = envSchema.safeParse({
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(false);
  });

  test('BETTER_AUTH_SECRET must be >= 32 chars', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('BETTER_AUTH_SECRET'));
      expect(issue).toBeDefined();
    }
  });

  test('NODE_ENV must be valid enum', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(false);
  });

  test('DATABASE_SSL transforms to boolean', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/test',
      DATABASE_SSL: 'true',
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_SSL).toBe(true);
    }
  });

  test('defaults are applied correctly', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/test',
      BETTER_AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-chars',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.FE_URL).toBe('http://localhost:3030');
      expect(result.data.DATABASE_SSL).toBe(false);
      expect(result.data.BETTER_AUTH_URL).toBe('http://localhost:8000');
    }
  });
});
