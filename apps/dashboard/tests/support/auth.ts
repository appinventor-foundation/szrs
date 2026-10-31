// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

export const baseURL = 'http://localhost:4173';

// The admin that global setup seeds once; resetDatabase() keeps it.
export const adminCredentials = {
	name: 'E2E Admin',
	email: 'admin@example.com',
	password: 'e2e-admin-password'
};

// Environment for the app server and for scripts/ensure-admin.ts under test.
export const testAuthEnv = {
	BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123456789',
	DASHBOARD_URL: baseURL,
	INITIAL_ADMIN_NAME: adminCredentials.name,
	INITIAL_ADMIN_EMAIL: adminCredentials.email,
	INITIAL_ADMIN_PASSWORD: adminCredentials.password
};
