import { describe, test, expect, beforeAll } from 'bun:test';
import './setup';
import { signIn, api } from './helpers';

let adminCookie: string;
let managerHqCookie: string;
let managerNorthCookie: string;

beforeAll(async () => {
  adminCookie = await signIn('admin@example.com');
  managerHqCookie = await signIn('manager-hq@example.com');
  managerNorthCookie = await signIn('manager-north@example.com');
});

// ── System Admin: sees everything ────────────────────────────
describe('Office Scope — Admin (global)', () => {
  test('sees all offices', async () => {
    const { status, body } = await api<{ total: number }>('GET', '/api/offices', { cookie: adminCookie });
    expect(status).toBe(200);
    expect(body.total).toBeGreaterThanOrEqual(4);
  });

  test('sees all users', async () => {
    const { status, body } = await api<{ total: number }>('GET', '/api/users', { cookie: adminCookie });
    expect(status).toBe(200);
    expect(body.total).toBeGreaterThanOrEqual(45);
  });

  test('can view any user by ID (cross-office)', async () => {
    // Get a north staff user ID
    const { body: northList } = await api<{ items: { email: string; id: string }[] }>(
      'GET', '/api/users?q=staff-north-01', { cookie: adminCookie },
    );
    expect(northList.items.length).toBeGreaterThanOrEqual(1);
    const northUserId = northList.items[0].id;

    const { status } = await api('GET', `/api/users/${northUserId}`, { cookie: adminCookie });
    expect(status).toBe(200);
  });
});

// ── Office Manager HQ: scoped to HQ ─────────────────────────
describe('Office Scope — Manager HQ', () => {
  test('sees only HQ office', async () => {
    const { status, body } = await api<{ total: number; items: { code: string }[] }>(
      'GET', '/api/offices', { cookie: managerHqCookie },
    );
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0].code).toBe('hq');
  });

  test('sees only HQ users (11: 1 manager + 10 staff)', async () => {
    const { status, body } = await api<{ total: number }>('GET', '/api/users', { cookie: managerHqCookie });
    expect(status).toBe(200);
    expect(body.total).toBe(11);
  });

  test('can view HQ staff by ID', async () => {
    const { body: list } = await api<{ items: { id: string }[] }>(
      'GET', '/api/users?q=staff-hq-01', { cookie: managerHqCookie },
    );
    expect(list.items.length).toBe(1);
    const { status } = await api('GET', `/api/users/${list.items[0].id}`, { cookie: managerHqCookie });
    expect(status).toBe(200);
  });

  test('CANNOT view North staff → 404 (out of scope)', async () => {
    // Use admin to get the North user's ID
    const { body: northList } = await api<{ items: { id: string }[] }>(
      'GET', '/api/users?q=staff-north-01', { cookie: adminCookie },
    );
    const northUserId = northList.items[0].id;

    const { status } = await api('GET', `/api/users/${northUserId}`, { cookie: managerHqCookie });
    expect(status).toBe(404);
  });

  test('CANNOT update North staff → 404 (out of scope)', async () => {
    const { body: northList } = await api<{ items: { id: string }[] }>(
      'GET', '/api/users?q=staff-north-01', { cookie: adminCookie },
    );
    const northUserId = northList.items[0].id;

    const { status } = await api('PATCH', `/api/users/${northUserId}`, {
      cookie: managerHqCookie,
      body: { name: 'Hacked Name' },
    });
    expect(status).toBe(404);
  });

  test('CANNOT delete North staff → 404 (out of scope)', async () => {
    const { body: northList } = await api<{ items: { id: string }[] }>(
      'GET', '/api/users?q=staff-north-02', { cookie: adminCookie },
    );
    const northUserId = northList.items[0].id;

    const { status } = await api('DELETE', `/api/users/${northUserId}`, { cookie: managerHqCookie });
    expect(status).toBe(404);
  });

  test('CANNOT view other offices by ID → 404', async () => {
    const { body: allOffices } = await api<{ items: { id: string; code: string }[] }>(
      'GET', '/api/offices', { cookie: adminCookie },
    );
    const northOffice = allOffices.items.find((o) => o.code === 'north');
    expect(northOffice).toBeDefined();

    const { status } = await api('GET', `/api/offices/${northOffice!.id}`, { cookie: managerHqCookie });
    expect(status).toBe(404);
  });

  test('search q= still scoped to HQ', async () => {
    const { body } = await api<{ total: number; items: { email: string }[] }>(
      'GET', '/api/users?q=staff-north', { cookie: managerHqCookie },
    );
    expect(body.total).toBe(0);
    expect(body.items).toHaveLength(0);
  });
});

// ── Office Manager North: scoped to North ────────────────────
describe('Office Scope — Manager North', () => {
  test('sees only North office', async () => {
    const { body } = await api<{ total: number; items: { code: string }[] }>(
      'GET', '/api/offices', { cookie: managerNorthCookie },
    );
    expect(body.total).toBe(1);
    expect(body.items[0].code).toBe('north');
  });

  test('sees only North users', async () => {
    const { body } = await api<{ total: number }>('GET', '/api/users', { cookie: managerNorthCookie });
    expect(body.total).toBe(11);
  });

  test('CANNOT see HQ users', async () => {
    const { body } = await api<{ total: number; items: unknown[] }>(
      'GET', '/api/users?q=staff-hq', { cookie: managerNorthCookie },
    );
    expect(body.total).toBe(0);
  });
});
