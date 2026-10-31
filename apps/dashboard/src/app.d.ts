// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Auth } from '#lib/server/auth/index.js';

type AuthSession = Auth['$Infer']['Session'];

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: AuthSession['user'];
			session?: AuthSession['session'];
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
