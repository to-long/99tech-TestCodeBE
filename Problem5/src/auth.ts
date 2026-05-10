import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client';
import { env } from './env';
import { accounts, sessions, users, verifications } from './db/schema/iam';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),

  advanced: {
    database: { generateId: false },
  },

  user: {
    additionalFields: {
      status: { type: 'string', required: false, defaultValue: 'active', input: false },
      lastLoginAt: { type: 'date', required: false, input: false },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      console.log(`[Reset Password] ${user.email}: ${url}`);
    },
  },

  trustedOrigins: [
    env.FE_URL,
    ...(env.NODE_ENV !== 'production'
      ? [`http://*:${env.FE_PORT ?? 3030}`]
      : []),
  ],
});
