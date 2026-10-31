// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { admin } from 'better-auth/plugins';
import type { Database } from '../db/create-database.js';
import * as schema from '../db/schema/index.js';

export type AuthOptions = {
	db: Database;
	secret: string;
	baseURL: string;
	/** Plugins that must come after the built-in ones (SvelteKit's cookie plugin). */
	trailingPlugins?: BetterAuthPlugin[];
};

// Relative imports only, no `$app/*`: `auth generate` and the seed script load
// this file outside Vite. The SvelteKit-specific wiring is in ./index.ts.
export function createAuth({ db, secret, baseURL, trailingPlugins = [] }: AuthOptions) {
	return betterAuth({
		secret,
		baseURL,
		trustedOrigins: [baseURL],
		database: drizzleAdapter(db, { provider: 'pg', schema }),
		// Closed registration: only an admin creates accounts.
		emailAndPassword: { enabled: true, disableSignUp: true },
		plugins: [admin(), ...trailingPlugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
