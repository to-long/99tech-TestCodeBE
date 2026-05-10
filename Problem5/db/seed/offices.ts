import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { auth } from '../../src/auth';
import { offices, roles, userOffices, userRoles, users } from '../../src/db/schema/iam';

const OFFICES = [
  { code: 'hq', name: 'Head Quarter', address: '1-1 Chiyoda, Tokyo' },
  { code: 'north', name: 'North Branch', address: '2-1 Kita-ku, Sapporo' },
  { code: 'south', name: 'South Branch', address: '3-1 Naha, Okinawa' },
  { code: 'east', name: 'East Branch', address: '4-1 Aoba-ku, Sendai' },
];

const DEFAULT_PASSWORD = 'Password123';

async function ensureUser(
  db: Db,
  email: string,
  name: string,
  roleCode: string,
  officeId: string,
): Promise<void> {
  // Check if user already exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    // Create via better-auth to handle password hashing
    const result = await auth.api.signUpEmail({
      body: { email, password: DEFAULT_PASSWORD, name },
    });
    if (!result?.user?.id) {
      console.warn(`    ⚠ Failed to create user ${email}`);
      return;
    }
    userId = result.user.id;
  }

  // Assign role
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, roleCode))
    .limit(1);
  if (role) {
    await db
      .insert(userRoles)
      .values({ userId, roleId: role.id })
      .onConflictDoNothing();
  }

  // Assign to office
  await db
    .insert(userOffices)
    .values({ userId, officeId })
    .onConflictDoNothing();
}

export async function seedOffices(db: Db): Promise<void> {
  console.log('  offices: upserting offices...');

  const officeMap = new Map<string, string>(); // code → id

  for (const o of OFFICES) {
    const [row] = await db
      .insert(offices)
      .values(o)
      .onConflictDoUpdate({ target: offices.code, set: { name: o.name, address: o.address } })
      .returning({ id: offices.id });
    officeMap.set(o.code, row.id);
  }

  // Create 1 system admin (no office assignment)
  console.log('  offices: creating system admin...');
  const [adminExists] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@example.com'))
    .limit(1);

  if (!adminExists) {
    const adminResult = await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: DEFAULT_PASSWORD, name: 'System Admin' },
    });
    if (adminResult?.user?.id) {
      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, 'system_admin'))
        .limit(1);
      if (adminRole) {
        await db
          .insert(userRoles)
          .values({ userId: adminResult.user.id, roleId: adminRole.id })
          .onConflictDoNothing();
      }
    }
  }

  // Create 4 office managers (1 per office)
  console.log('  offices: creating office managers...');
  const officeKeys = ['hq', 'north', 'south', 'east'] as const;
  for (const key of officeKeys) {
    const officeId = officeMap.get(key)!;
    await ensureUser(
      db,
      `manager-${key}@example.com`,
      `Manager ${key.charAt(0).toUpperCase() + key.slice(1)}`,
      'office_manager',
      officeId,
    );
  }

  // Create 40 office staff (10 per office)
  console.log('  offices: creating office staff (40 users)...');
  for (const key of officeKeys) {
    const officeId = officeMap.get(key)!;
    for (let i = 1; i <= 10; i++) {
      const num = String(i).padStart(2, '0');
      await ensureUser(
        db,
        `staff-${key}-${num}@example.com`,
        `Staff ${key.charAt(0).toUpperCase() + key.slice(1)} ${num}`,
        'office_staff',
        officeId,
      );
    }
  }

  console.log('  offices: done. (1 admin + 4 managers + 40 staff = 45 users)');
}
