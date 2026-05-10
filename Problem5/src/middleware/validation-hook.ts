import type { Context } from 'hono';

// biome-ignore lint/suspicious/noExplicitAny: intentional
export function validationHook(result: any, c: Context): Response | undefined {
  if (result.success) return undefined;
  if (!result.error) return undefined;

  const issues = (result.error.issues as Array<{
    path: PropertyKey[];
    message: string;
    code: string;
    minimum?: number;
    maximum?: number;
  }>).map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.message,
  }));

  return c.json({ error: 'validation_failed', issues }, 400);
}
