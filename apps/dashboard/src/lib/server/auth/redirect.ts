// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Where to send someone after they sign in. Only a path on this site is
// accepted, so the login page can't be turned into an open redirect.
export function safeRedirectPath(raw: string | null | undefined, fallback = '/'): string {
	if (!raw) return fallback;
	// A single leading slash, and not `//host` or `/\host`, which browsers treat
	// as another origin. No control characters either.
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
	return raw;
}
