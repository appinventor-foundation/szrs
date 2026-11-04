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
	},
	PROXY_URL: {
		schema: z.url(),
		description:
			"Base URL of the LLM proxy, reachable from the dashboard's server (never from browsers)"
	},
	ZOOM_DEFAULT_MODEL: {
		schema: z.string().min(1).default('openrouter'),
		description: 'LiteLLM model alias the demo runner starts with, until the proxy lists its models'
	},
	PROXY_API_KEY: {
		schema: z.string().optional(),
		description: "The proxy's INTERNAL_API_KEY, sent as x-internal-api-key when the proxy sets one"
	}
});
