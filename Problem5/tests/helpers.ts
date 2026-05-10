import { app } from '../src/app';

const DEFAULT_PASSWORD = 'Password123';

/**
 * Sign in and return the session cookie string.
 */
export async function signIn(email: string, password = DEFAULT_PASSWORD): Promise<string> {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signIn failed for ${email}: ${res.status}`);
  const cookies = res.headers.getSetCookie();
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Make an authenticated API request, returning { status, body }.
 */
export async function api<T = unknown>(
  method: Method,
  path: string,
  opts?: { cookie?: string; body?: unknown },
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (opts?.cookie) headers['Cookie'] = opts.cookie;
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await app.request(path, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let body: T;
  if (res.status === 204) {
    body = null as T;
  } else {
    body = (await res.json()) as T;
  }
  return { status: res.status, body };
}
