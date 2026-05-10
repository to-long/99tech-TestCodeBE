import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../src/db/client';
import { seedAll } from './seed/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, 'drizzle');

async function main(): Promise<void> {
  console.log('Running drizzle migrations...');
  await drizzleMigrate(db, { migrationsFolder });
  console.log('Drizzle migrations complete.');
  await seedAll();
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
