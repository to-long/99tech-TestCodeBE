import { beforeAll } from 'bun:test';
import { seedAll } from '../db/seed/index';

let seeded = false;

beforeAll(async () => {
  if (!seeded) {
    await seedAll();
    seeded = true;
  }
});
