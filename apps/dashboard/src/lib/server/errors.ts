// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Domain errors thrown by services. Routes map them to HTTP responses.
export class NotFoundError extends Error {
	constructor(entity: string, id: string) {
		super(`${entity} ${id} not found`);
		this.name = 'NotFoundError';
	}
}
