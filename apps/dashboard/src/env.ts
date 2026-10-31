// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

// Kit validates these when the server starts and exposes them through
// `$app/env/private`, which only server code can import.
export const variables = defineEnvVars({
	DATABASE_URL: {
		schema: z.url(),
		description: 'Postgres connection string for the dashboard database'
	},
	BETTER_AUTH_SECRET: {
		schema: z.string().min(32),
		description: 'Secret that signs sessions and encrypts auth data (openssl rand -hex 32)'
	},
	DASHBOARD_URL: {
		schema: z.url(),
		description: "The dashboard's public URL, used as better-auth's base URL and trusted origin"
	}
});
