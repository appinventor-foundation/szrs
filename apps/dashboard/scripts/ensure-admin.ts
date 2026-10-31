// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Creates the first admin when none exists. Run by the migrate step on every
// deploy (see the Dockerfile `migrate` target) and by `pnpm auth:seed` locally.
// Idempotent. Exits 1 when there is no admin and nothing to create one from.
//
// Relative imports, not `#lib`: tsx runs this outside Vite.
import { z } from 'zod';
import { createAuth } from '../src/lib/server/auth/create-auth.js';
import { createDatabase } from '../src/lib/server/db/create-database.js';
import { BootstrapError } from '../src/lib/server/errors.js';
import { createUserRepository } from '../src/lib/server/repositories/users.js';
import { ensureAdmin } from '../src/lib/server/services/bootstrap.js';

// Compose passes unset variables as empty strings.
const optional = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const env = z
	.object({
		DATABASE_URL: z.url(),
		BETTER_AUTH_SECRET: z.string().min(32),
		DASHBOARD_URL: z.url(),
		INITIAL_ADMIN_EMAIL: optional(z.string().trim().toLowerCase().pipe(z.email())),
		INITIAL_ADMIN_PASSWORD: optional(z.string().min(8).max(128)),
		INITIAL_ADMIN_NAME: optional(z.string().trim().min(1))
	})
	.parse(process.env);

const db = createDatabase(env.DATABASE_URL);
const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: env.DASHBOARD_URL });

try {
	const initial =
		env.INITIAL_ADMIN_EMAIL && env.INITIAL_ADMIN_PASSWORD
			? {
					email: env.INITIAL_ADMIN_EMAIL,
					password: env.INITIAL_ADMIN_PASSWORD,
					name: env.INITIAL_ADMIN_NAME
				}
			: undefined;
	const outcome = await ensureAdmin(createUserRepository({ auth, db }), initial);
	console.log(outcome === 'created' ? 'Created the initial admin' : 'An admin already exists');
} catch (err) {
	if (err instanceof BootstrapError) {
		console.error(err.message);
		process.exitCode = 1;
	} else {
		throw err;
	}
} finally {
	await db.$client.end();
}
