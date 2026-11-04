// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// SvelteKit's getClientAddress throws when it cannot tell (for example when the
// browser has already cancelled the request and the socket is gone). The address
// only feeds the proxy's rate limit, so that must not turn into a 500.
export function clientAddressOf(getClientAddress: () => string): string | undefined {
	try {
		return getClientAddress();
	} catch {
		return undefined;
	}
}
