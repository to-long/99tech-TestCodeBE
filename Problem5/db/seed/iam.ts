import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { permissions, rolePermissions, roles } from '../../src/db/schema/iam';

const PERMISSION_CATALOG = [
  // user
  { code: 'user:read', name: 'Read users', description: 'View user list and details' },
  { code: 'user:create', name: 'Create users', description: 'Create new user accounts' },
  { code: 'user:update', name: 'Update users', description: 'Edit user profiles and assign roles' },
  { code: 'user:delete', name: 'Delete users', description: 'Soft-delete and restore users' },
  // role
  { code: 'role:read', name: 'Read roles', description: 'View role list and details' },
  { code: 'role:create', name: 'Create roles', description: 'Create new roles' },
  { code: 'role:update', name: 'Update roles', description: 'Edit roles and assign permissions' },
  { code: 'role:delete', name: 'Delete roles', description: 'Delete roles' },
  // permission
  { code: 'permission:read', name: 'Read permissions', description: 'View permission list' },
  { code: 'permission:create', name: 'Create permissions', description: 'Create new permissions' },
  { code: 'permission:update', name: 'Update permissions', description: 'Edit permissions' },
  { code: 'permission:delete', name: 'Delete permissions', description: 'Delete permissions' },
  // office
  { code: 'office:read', name: 'Read offices', description: 'View office list and details' },
  { code: 'office:create', name: 'Create offices', description: 'Create new offices' },
  { code: 'office:update', name: 'Update offices', description: 'Edit offices and manage members' },
  { code: 'office:delete', name: 'Delete offices', description: 'Delete offices' },
];

const ROLE_ROWS = [
  { code: 'system_admin', name: 'System Administrator', description: 'Full access to all resources.' },
  { code: 'office_manager', name: 'Office Manager', description: 'Manage users and resources within assigned offices.' },
  { code: 'office_staff', name: 'Office Staff', description: 'Basic access, can only view own profile.' },
] as const;

type RoleCode = (typeof ROLE_ROWS)[number]['code'];

const ROLE_GRANTS: Record<RoleCode, string[]> = {
  system_admin: PERMISSION_CATALOG.map((p) => p.code),
  office_manager: [
    'user:read', 'user:create', 'user:update', 'user:delete',
    'role:read', 'permission:read', 'office:read',
  ],
  office_staff: [],
};

export async function seedIam(db: Db): Promise<void> {
  console.log('  iam: upserting permissions...');
  for (const p of PERMISSION_CATALOG) {
    await db
      .insert(permissions)
      .values(p)
      .onConflictDoUpdate({ target: permissions.code, set: { name: p.name, description: p.description } });
  }

  console.log('  iam: upserting roles...');
  for (const r of ROLE_ROWS) {
    await db
      .insert(roles)
      .values(r)
      .onConflictDoUpdate({ target: roles.code, set: { name: r.name, description: r.description } });
  }

  console.log('  iam: rebuilding role_permissions...');
  for (const r of ROLE_ROWS) {
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, r.code));
    if (!role) continue;

    const codes = ROLE_GRANTS[r.code];
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));

    if (codes.length > 0) {
      const permRows = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.code, codes));

      if (permRows.length > 0) {
        await db.insert(rolePermissions).values(
          permRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
        );
      }
    }
  }

  console.log('  iam: done.');
}
