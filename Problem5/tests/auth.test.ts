import { describe, test, expect, beforeAll } from 'bun:test';
import './setup';
import { signIn, api } from './helpers';

describe('Authentication', () => {
  test('unauthenticated request → 401', async () => {
    const { status } = await api('GET', '/api/users');
    expect(status).toBe(401);
  });

  test('unauthenticated request to /api/roles → 401', async () => {
    const { status } = await api('GET', '/api/roles');
    expect(status).toBe(401);
  });

  test('unauthenticated request to /api/offices → 401', async () => {
    const { status } = await api('GET', '/api/offices');
    expect(status).toBe(401);
  });

  test('invalid credentials → non-200', async () => {
    const { status } = await api('POST', '/api/auth/sign-in/email', {
      body: { email: 'admin@example.com', password: 'wrongpassword' },
    });
    expect(status).not.toBe(200);
  });

  test('valid admin login → 200', async () => {
    const cookie = await signIn('admin@example.com');
    expect(cookie).toBeTruthy();
    expect(cookie.length).toBeGreaterThan(0);
  });

  test('authenticated request with valid cookie → 200', async () => {
    const cookie = await signIn('admin@example.com');
    const { status } = await api('GET', '/api/users', { cookie });
    expect(status).toBe(200);
  });

  test('GET /api/users/me works without extra permissions', async () => {
    const cookie = await signIn('staff-hq-01@example.com');
    const { status, body } = await api<{ name: string; email: string }>('GET', '/api/users/me', { cookie });
    expect(status).toBe(200);
    expect(body.email).toBe('staff-hq-01@example.com');
  });
});
