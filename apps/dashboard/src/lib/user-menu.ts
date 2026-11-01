// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Presentation helpers for the account menu in the header.

// The letter shown in the avatar: the first character of the name, or of the
// email when the name is blank.
export function avatarInitial(name: string, email: string): string {
	const source = name.trim() || email.trim();
	return source ? (Array.from(source)[0] ?? '?').toUpperCase() : '?';
}

export function roleLabel(isAdmin: boolean): string {
	return isAdmin ? 'Administrator' : 'Member';
}
