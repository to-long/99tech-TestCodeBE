import 'dotenv/config';
import { db } from '../../src/db/client';
import { seedIam } from './iam';
import { seedOffices } from './offices';

export async function seedAll(): Promise<void> {
  console.log('Seeding...');
  await seedIam(db);
  await seedOffices(db);
  console.log('Seed complete.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAll()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
