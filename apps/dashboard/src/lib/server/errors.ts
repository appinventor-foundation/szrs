// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Domain errors thrown by services. Routes map them to HTTP responses or to
// messages shown next to a form.
export class NotFoundError extends Error {
	constructor(entity: string, id: string) {
		super(`${entity} ${id} not found`);
		this.name = 'NotFoundError';
	}
}

// A business rule said no (for example "you cannot delete yourself"). The
// message is written for the person who triggered it.
export class RuleViolationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RuleViolationError';
	}
}

export class InvalidCredentialsError extends Error {
	constructor(message = 'Invalid email or password') {
		super(message);
		this.name = 'InvalidCredentialsError';
	}
}

// Nothing to sign in with and no admin to start from.
export class BootstrapError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BootstrapError';
	}
}
