// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Relative imports only: reachable from scripts/ensure-admin.ts and the tests.

// better-auth stores several roles as one comma-separated string.
export function hasRole(role: string | null | undefined, wanted: string): boolean {
	return (role ?? '').split(',').some((part) => part.trim() === wanted);
}

export function isAdmin(user: { role?: string | null } | null | undefined): boolean {
	return hasRole(user?.role, 'admin');
}
