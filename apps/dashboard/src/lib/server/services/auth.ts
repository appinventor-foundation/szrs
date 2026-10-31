// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { SessionRepository } from '#lib/server/repositories/sessions.js';

export interface AuthService {
	signIn(email: string, password: string, headers: Headers): Promise<void>;
	signOut(headers: Headers): Promise<void>;
}

export function createAuthService(sessions: SessionRepository): AuthService {
	return {
		signIn: (email, password, headers) => sessions.signIn(email, password, headers),
		signOut: (headers) => sessions.signOut(headers)
	};
}
