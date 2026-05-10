import { describe, test, expect, beforeAll } from 'bun:test';
import './setup';
import { signIn, api } from './helpers';

let adminCookie: string;
let managerCookie: string;
let staffCookie: string;

beforeAll(async () => {
  adminCookie = await signIn('admin@example.com');
  managerCookie = await signIn('manager-hq@example.com');
  staffCookie = await signIn('staff-hq-01@example.com');
});

// ── System Admin: full access ────────────────────────────────
describe('RBAC — System Admin', () => {
  test('can list users', async () => {
    const { status } = await api('GET', '/api/users', { cookie: adminCookie });
    expect(status).toBe(200);
  });

  test('can list roles', async () => {
    const { status } = await api('GET', '/api/roles', { cookie: adminCookie });
    expect(status).toBe(200);
  });

  test('can list permissions', async () => {
    const { status } = await api('GET', '/api/permissions', { cookie: adminCookie });
    expect(status).toBe(200);
  });

  test('can list offices', async () => {
    const { status } = await api('GET', '/api/offices', { cookie: adminCookie });
    expect(status).toBe(200);
  });

  test('can create a role', async () => {
    const { status } = await api('POST', '/api/roles', {
      cookie: adminCookie,
      body: { code: 'test_role_admin', name: 'Test Role' },
    });
    expect(status).toBe(201);
  });

  test('can create a permission', async () => {
    const { status } = await api('POST', '/api/permissions', {
      cookie: adminCookie,
      body: { code: 'test:admin', name: 'Test Permission' },
    });
    expect(status).toBe(201);
  });

  test('can create an office', async () => {
    const { status } = await api('POST', '/api/offices', {
      cookie: adminCookie,
      body: { code: 'test_office', name: 'Test Office' },
    });
    expect(status).toBe(201);
  });
});

// ── Office Manager: limited access ──────────────────────────
describe('RBAC — Office Manager', () => {
  test('can list users', async () => {
    const { status } = await api('GET', '/api/users', { cookie: managerCookie });
    expect(status).toBe(200);
  });

  test('can list roles (read-only)', async () => {
    const { status } = await api('GET', '/api/roles', { cookie: managerCookie });
    expect(status).toBe(200);
  });

  test('can list permissions (read-only)', async () => {
    const { status } = await api('GET', '/api/permissions', { cookie: managerCookie });
    expect(status).toBe(200);
  });

  test('can list offices (scoped)', async () => {
    const { status } = await api('GET', '/api/offices', { cookie: managerCookie });
    expect(status).toBe(200);
  });

  test('CANNOT create roles → 403', async () => {
    const { status } = await api('POST', '/api/roles', {
      cookie: managerCookie,
      body: { code: 'mgr_test_role', name: 'Manager Test Role' },
    });
    expect(status).toBe(403);
  });

  test('CANNOT create permissions → 403', async () => {
    const { status } = await api('POST', '/api/permissions', {
      cookie: managerCookie,
      body: { code: 'mgr:test', name: 'Manager Test Perm' },
    });
    expect(status).toBe(403);
  });

  test('CANNOT create offices → 403', async () => {
    const { status } = await api('POST', '/api/offices', {
      cookie: managerCookie,
      body: { code: 'mgr_office', name: 'Manager Office' },
    });
    expect(status).toBe(403);
  });

  test('CANNOT delete roles → 403', async () => {
    const { status } = await api('DELETE', '/api/roles/00000000-0000-0000-0000-000000000000', {
      cookie: managerCookie,
    });
    expect(status).toBe(403);
  });

  test('CANNOT delete permissions → 403', async () => {
    const { status } = await api('DELETE', '/api/permissions/00000000-0000-0000-0000-000000000000', {
      cookie: managerCookie,
    });
    expect(status).toBe(403);
  });

  test('CANNOT delete offices → 403', async () => {
    const { status } = await api('DELETE', '/api/offices/00000000-0000-0000-0000-000000000000', {
      cookie: managerCookie,
    });
    expect(status).toBe(403);
  });
});

// ── Office Staff: minimal access ────────────────────────────
describe('RBAC — Office Staff', () => {
  test('CANNOT list users → 403', async () => {
    const { status } = await api('GET', '/api/users', { cookie: staffCookie });
    expect(status).toBe(403);
  });

  test('CANNOT list roles → 403', async () => {
    const { status } = await api('GET', '/api/roles', { cookie: staffCookie });
    expect(status).toBe(403);
  });

  test('CANNOT list permissions → 403', async () => {
    const { status } = await api('GET', '/api/permissions', { cookie: staffCookie });
    expect(status).toBe(403);
  });

  test('CANNOT list offices → 403', async () => {
    const { status } = await api('GET', '/api/offices', { cookie: staffCookie });
    expect(status).toBe(403);
  });

  test('CANNOT create users → 403', async () => {
    const { status } = await api('POST', '/api/users', {
      cookie: staffCookie,
      body: { email: 'x@x.com', password: 'Password123', name: 'X' },
    });
    expect(status).toBe(403);
  });

  test('CAN access /api/users/me → 200', async () => {
    const { status, body } = await api<{ email: string; roles: string[] }>(
      'GET', '/api/users/me', { cookie: staffCookie },
    );
    expect(status).toBe(200);
    expect(body.email).toBe('staff-hq-01@example.com');
    expect(body.roles).toContain('office_staff');
  });

  test('/me includes office info', async () => {
    const { body } = await api<{ offices: { name: string }[] }>(
      'GET', '/api/users/me', { cookie: staffCookie },
    );
    expect(body.offices).toHaveLength(1);
    expect(body.offices[0].name).toBe('Head Quarter');
  });
});
