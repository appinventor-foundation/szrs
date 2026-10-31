// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { APIError } from 'better-auth/api';
import type { Auth } from '../auth/create-auth.js';
import { InvalidCredentialsError } from '../errors.js';

export interface SessionRepository {
	signIn(email: string, password: string, headers: Headers): Promise<void>;
	signOut(headers: Headers): Promise<void>;
}

// better-auth owns sessions, so this wraps its API instead of Drizzle queries.
// The SvelteKit cookie plugin sets the session cookie on the response.
export function createSessionRepository(auth: Auth): SessionRepository {
	return {
		async signIn(email, password, headers) {
			try {
				await auth.api.signInEmail({ body: { email, password }, headers });
			} catch (err) {
				if (err instanceof APIError) {
					if (err.statusCode === 401) throw new InvalidCredentialsError();
					// Wrong credentials are 401. Anything else the plugin refuses (such as a
					// banned account) comes with its own message, and that only appears
					// after the password was already accepted.
					if (err.statusCode === 403) {
						throw new InvalidCredentialsError(err.body?.message ?? 'This account cannot sign in');
					}
				}
				throw err;
			}
		},

		async signOut(headers) {
			await auth.api.signOut({ headers });
		}
	};
}
