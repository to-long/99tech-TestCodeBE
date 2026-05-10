import { describe, test, expect, beforeAll } from 'bun:test';
import './setup';
import { signIn, api } from './helpers';

let adminCookie: string;
let managerCookie: string;

beforeAll(async () => {
  adminCookie = await signIn('admin@example.com');
  managerCookie = await signIn('manager-hq@example.com');
});

// ── Users CRUD ───────────────────────────────────────────────
describe('Users CRUD', () => {
  let createdUserId: string;

  test('create user', async () => {
    const { status, body } = await api<{ id: string; email: string; roles: string[]; offices: { code: string }[] }>(
      'POST', '/api/users', {
        cookie: adminCookie,
        body: {
          email: 'test-crud@example.com',
          password: 'Password123',
          name: 'CRUD Test User',
          roleCodes: ['office_staff'],
          officeCodes: ['hq'],
        },
      },
    );
    expect(status).toBe(201);
    expect(body.email).toBe('test-crud@example.com');
    expect(body.roles).toContain('office_staff');
    expect(body.offices.some((o) => o.code === 'hq')).toBe(true);
    createdUserId = body.id;
  });

  test('create duplicate email → 409', async () => {
    const { status } = await api('POST', '/api/users', {
      cookie: adminCookie,
      body: { email: 'test-crud@example.com', password: 'Password123', name: 'Dup' },
    });
    expect(status).toBe(409);
  });

  test('get user by id', async () => {
    const { status, body } = await api<{ id: string; email: string }>(
      'GET', `/api/users/${createdUserId}`, { cookie: adminCookie },
    );
    expect(status).toBe(200);
    expect(body.id).toBe(createdUserId);
  });

  test('update user', async () => {
    const { status, body } = await api<{ name: string }>(
      'PATCH', `/api/users/${createdUserId}`, {
        cookie: adminCookie,
        body: { name: 'Updated CRUD User' },
      },
    );
    expect(status).toBe(200);
    expect(body.name).toBe('Updated CRUD User');
  });

  test('update with no fields → 400', async () => {
    const { status } = await api('PATCH', `/api/users/${createdUserId}`, {
      cookie: adminCookie,
      body: {},
    });
    expect(status).toBe(400);
  });

  test('set user roles', async () => {
    const { status, body } = await api<{ roles: string[] }>(
      'PUT', `/api/users/${createdUserId}/roles`, {
        cookie: adminCookie,
        body: { roleCodes: ['office_manager'] },
      },
    );
    expect(status).toBe(200);
    expect(body.roles).toContain('office_manager');
  });

  test('set unknown roles → 400', async () => {
    const { status } = await api('PUT', `/api/users/${createdUserId}/roles`, {
      cookie: adminCookie,
      body: { roleCodes: ['nonexistent_role'] },
    });
    expect(status).toBe(400);
  });

  test('soft delete user', async () => {
    const { status } = await api('DELETE', `/api/users/${createdUserId}`, { cookie: adminCookie });
    expect(status).toBe(204);
  });

  test('soft-deleted user not visible', async () => {
    const { status } = await api('GET', `/api/users/${createdUserId}`, { cookie: adminCookie });
    expect(status).toBe(404);
  });

  test('restore user', async () => {
    const { status, body } = await api<{ email: string }>(
      'POST', `/api/users/${createdUserId}/restore`, { cookie: adminCookie },
    );
    expect(status).toBe(200);
    expect(body.email).toBe('test-crud@example.com');
  });

  test('restore non-deleted user → 409', async () => {
    const { status } = await api('POST', `/api/users/${createdUserId}/restore`, { cookie: adminCookie });
    expect(status).toBe(409);
  });

  test('get nonexistent user → 404', async () => {
    const { status } = await api('GET', '/api/users/00000000-0000-0000-0000-000000000000', { cookie: adminCookie });
    expect(status).toBe(404);
  });
});

// ── Roles CRUD ───────────────────────────────────────────────
describe('Roles CRUD', () => {
  let createdRoleId: string;

  test('create role', async () => {
    const { status, body } = await api<{ id: string; code: string }>(
      'POST', '/api/roles', {
        cookie: adminCookie,
        body: { code: 'test_crud_role', name: 'CRUD Test Role', permissionCodes: ['user:read'] },
      },
    );
    expect(status).toBe(201);
    expect(body.code).toBe('test_crud_role');
    createdRoleId = body.id;
  });

  test('create duplicate code → 409', async () => {
    const { status } = await api('POST', '/api/roles', {
      cookie: adminCookie,
      body: { code: 'test_crud_role', name: 'Dup' },
    });
    expect(status).toBe(409);
  });

  test('get role detail', async () => {
    const { status, body } = await api<{ id: string; permissions: string[] }>(
      'GET', `/api/roles/${createdRoleId}`, { cookie: adminCookie },
    );
    expect(status).toBe(200);
    expect(body.permissions).toContain('user:read');
  });

  test('update role', async () => {
    const { status, body } = await api<{ name: string }>(
      'PATCH', `/api/roles/${createdRoleId}`, {
        cookie: adminCookie,
        body: { name: 'Updated CRUD Role' },
      },
    );
    expect(status).toBe(200);
    expect(body.name).toBe('Updated CRUD Role');
  });

  test('set role permissions', async () => {
    const { status, body } = await api<{ permissions: string[] }>(
      'PUT', `/api/roles/${createdRoleId}/permissions`, {
        cookie: adminCookie,
        body: { permissionCodes: ['user:read', 'role:read'] },
      },
    );
    expect(status).toBe(200);
    expect(body.permissions).toContain('user:read');
    expect(body.permissions).toContain('role:read');
  });

  test('set unknown permissions → 400', async () => {
    const { status } = await api('PUT', `/api/roles/${createdRoleId}/permissions`, {
      cookie: adminCookie,
      body: { permissionCodes: ['does:not:exist'] },
    });
    expect(status).toBe(400);
  });

  test('delete role', async () => {
    const { status } = await api('DELETE', `/api/roles/${createdRoleId}`, { cookie: adminCookie });
    expect(status).toBe(204);
  });

  test('get deleted role → 404', async () => {
    const { status } = await api('GET', `/api/roles/${createdRoleId}`, { cookie: adminCookie });
    expect(status).toBe(404);
  });
});

// ── Permissions CRUD ─────────────────────────────────────────
describe('Permissions CRUD', () => {
  let createdPermId: string;

  test('create permission', async () => {
    const { status, body } = await api<{ id: string; code: string }>(
      'POST', '/api/permissions', {
        cookie: adminCookie,
        body: { code: 'test:crud', name: 'CRUD Test Perm' },
      },
    );
    expect(status).toBe(201);
    expect(body.code).toBe('test:crud');
    createdPermId = body.id;
  });

  test('create duplicate → 409', async () => {
    const { status } = await api('POST', '/api/permissions', {
      cookie: adminCookie,
      body: { code: 'test:crud', name: 'Dup' },
    });
    expect(status).toBe(409);
  });

  test('get permission', async () => {
    const { status, body } = await api<{ code: string }>('GET', `/api/permissions/${createdPermId}`, { cookie: adminCookie });
    expect(status).toBe(200);
    expect(body.code).toBe('test:crud');
  });

  test('update permission', async () => {
    const { status, body } = await api<{ name: string }>(
      'PATCH', `/api/permissions/${createdPermId}`, {
        cookie: adminCookie,
        body: { name: 'Updated CRUD Perm' },
      },
    );
    expect(status).toBe(200);
    expect(body.name).toBe('Updated CRUD Perm');
  });

  test('delete permission', async () => {
    const { status } = await api('DELETE', `/api/permissions/${createdPermId}`, { cookie: adminCookie });
    expect(status).toBe(204);
  });
});

// ── Offices CRUD ─────────────────────────────────────────────
describe('Offices CRUD', () => {
  let createdOfficeId: string;

  test('create office', async () => {
    const { status, body } = await api<{ id: string; code: string; name: string }>(
      'POST', '/api/offices', {
        cookie: adminCookie,
        body: { code: 'crud_office', name: 'CRUD Test Office', address: 'Test Addr' },
      },
    );
    expect(status).toBe(201);
    expect(body.code).toBe('crud_office');
    createdOfficeId = body.id;
  });

  test('create duplicate → 409', async () => {
    const { status } = await api('POST', '/api/offices', {
      cookie: adminCookie,
      body: { code: 'crud_office', name: 'Dup' },
    });
    expect(status).toBe(409);
  });

  test('get office detail', async () => {
    const { status, body } = await api<{ code: string; members: unknown[] }>(
      'GET', `/api/offices/${createdOfficeId}`, { cookie: adminCookie },
    );
    expect(status).toBe(200);
    expect(body.code).toBe('crud_office');
    expect(body.members).toHaveLength(0);
  });

  test('update office', async () => {
    const { status, body } = await api<{ name: string }>(
      'PATCH', `/api/offices/${createdOfficeId}`, {
        cookie: adminCookie,
        body: { name: 'Updated CRUD Office' },
      },
    );
    expect(status).toBe(200);
    expect(body.name).toBe('Updated CRUD Office');
  });

  test('set office members', async () => {
    // Get a user ID to assign
    const { body: userList } = await api<{ items: { id: string }[] }>(
      'GET', '/api/users?q=test-crud@example.com', { cookie: adminCookie },
    );
    if (userList.items.length > 0) {
      const userId = userList.items[0].id;
      const { status, body } = await api<{ members: { id: string }[] }>(
        'PUT', `/api/offices/${createdOfficeId}/members`, {
          cookie: adminCookie,
          body: { userIds: [userId] },
        },
      );
      expect(status).toBe(200);
      expect(body.members).toHaveLength(1);
    }
  });

  test('set unknown user IDs → 400', async () => {
    const { status } = await api('PUT', `/api/offices/${createdOfficeId}/members`, {
      cookie: adminCookie,
      body: { userIds: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(status).toBe(400);
  });

  test('delete office', async () => {
    const { status } = await api('DELETE', `/api/offices/${createdOfficeId}`, { cookie: adminCookie });
    expect(status).toBe(204);
  });

  test('get deleted office → 404', async () => {
    const { status } = await api('GET', `/api/offices/${createdOfficeId}`, { cookie: adminCookie });
    expect(status).toBe(404);
  });

  test('office manager CANNOT CRUD offices', async () => {
    const { status: createStatus } = await api('POST', '/api/offices', {
      cookie: managerCookie,
      body: { code: 'mgr_office', name: 'Mgr Office' },
    });
    expect(createStatus).toBe(403);
  });
});
