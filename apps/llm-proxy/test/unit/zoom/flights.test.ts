import type { ZoomStreamEvent } from '@szrs/llm-proxy-contracts';
import { describe, expect, it } from 'vitest';

import { ZoomFlights, type Subscription } from '../../../src/zoom/flights.js';

const attempt: ZoomStreamEvent = { type: 'attempt', attempt: 1, maxAttempts: 3 };
const token: ZoomStreamEvent = { type: 'token', text: 'x' };
const done: ZoomStreamEvent = {
	type: 'done',
	result: {
		semantic: { blockDefs: [{ type: 'zoom_a' }], workspaceJson: {}, bindings: [] },
		concept: { blockDefs: [{ type: 'zoom_b' }], workspaceJson: {}, bindings: [] }
	}
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A run the test drives by hand, and that records whether it was started and stopped. */
function controlled() {
	const queue: (ZoomStreamEvent | null)[] = [];
	let notify: (() => void) | null = null;
	const state = { started: 0, returned: false };

	async function* start(): AsyncGenerator<ZoomStreamEvent> {
		state.started++;
		try {
			for (;;) {
				while (queue.length === 0) await new Promise<void>((resolve) => (notify = resolve));
				const next = queue.shift();
				if (next === null || next === undefined) return;
				yield next;
			}
		} finally {
			state.returned = true;
		}
	}

	const send = (event: ZoomStreamEvent | null) => {
		queue.push(event);
		notify?.();
	};
	return { start, state, emit: send, end: () => send(null) };
}

async function collect(subscription: Subscription): Promise<ZoomStreamEvent[]> {
	const events: ZoomStreamEvent[] = [];
	for await (const event of subscription.events) events.push(event);
	return events;
}

describe('ZoomFlights', () => {
	it('runs once for a key and gives every subscriber all the events, including earlier ones', async () => {
		const flights = new ZoomFlights();
		const run = controlled();

		const first = flights.join('k', run.start);
		run.emit(attempt);
		await tick();
		const second = flights.join('k', run.start);
		run.emit(token);
		run.emit(done);
		run.end();

		expect(first.joined).toBe(false);
		expect(second.joined).toBe(true);
		expect(await collect(first)).toEqual([attempt, token, done]);
		expect(await collect(second)).toEqual([attempt, token, done]);
		expect(run.state.started).toBe(1);
	});

	it('runs separately for different keys', async () => {
		const flights = new ZoomFlights();
		const a = controlled();
		const b = controlled();

		flights.join('a', a.start);
		flights.join('b', b.start);
		await tick();

		expect(a.state.started).toBe(1);
		expect(b.state.started).toBe(1);
	});

	it('carries on while any subscriber is left', async () => {
		const flights = new ZoomFlights();
		const run = controlled();
		const leaving = flights.join('k', run.start);
		const staying = flights.join('k', run.start);

		run.emit(attempt);
		await tick();
		leaving.close();
		run.emit(done);
		run.end();

		expect(await collect(staying)).toEqual([attempt, done]);
	});

	it('stops the run, and lets a later request start a new one, once everyone has left', async () => {
		const flights = new ZoomFlights();
		const run = controlled();
		const a = flights.join('k', run.start);
		const b = flights.join('k', run.start);

		run.emit(attempt);
		await tick();
		a.close();
		b.close();
		run.emit(token);
		await tick();

		expect(run.state.returned).toBe(true);
		const replacement = controlled();
		const later = flights.join('k', replacement.start);
		await tick();
		expect(later.joined).toBe(false);
		expect(replacement.state.started).toBe(1);
	});

	it('counts a subscriber that never reads, and stops counting it when it is closed', async () => {
		const flights = new ZoomFlights();
		const run = controlled();
		const never = flights.join('k', run.start);

		run.emit(attempt);
		run.emit(token);
		await tick();
		// Nobody has read `never.events`, but it still counts, so the run goes on.
		expect(run.state.returned).toBe(false);

		never.close();
		run.emit(token);
		await tick();
		expect(run.state.returned).toBe(true);
	});

	it('starts a new run once the last one has finished', async () => {
		const flights = new ZoomFlights();
		const first = controlled();
		const a = flights.join('k', first.start);
		first.emit(done);
		first.end();
		await collect(a);

		const second = controlled();
		const b = flights.join('k', second.start);
		await tick();

		expect(b.joined).toBe(false);
		expect(second.state.started).toBe(1);
	});

	it('gives the result to a request that arrives after it but before the run ends', async () => {
		const flights = new ZoomFlights();
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		let started = 0;
		async function* slowToFinish(): AsyncGenerator<ZoomStreamEvent> {
			started++;
			yield done;
			await gate; // e.g. storing the result
		}

		const first = flights.join('k', slowToFinish);
		await tick();
		const late = flights.join('k', slowToFinish);
		release();

		expect(late.joined).toBe(true);
		expect(await collect(first)).toEqual([done]);
		expect(await collect(late)).toEqual([done]);
		expect(started).toBe(1);
	});

	it('still lets a finished result through when everyone has left by then', async () => {
		const flights = new ZoomFlights();
		let stored = false;
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		async function* finishing(): AsyncGenerator<ZoomStreamEvent> {
			await gate;
			yield done;
			stored = true; // what runs after the result: storing it
		}

		const only = flights.join('k', finishing);
		only.close();
		release();
		await tick();
		await tick();

		expect(stored).toBe(true);
	});

	it('reports an error thrown by the run to every subscriber', async () => {
		const flights = new ZoomFlights();
		async function* failing(): AsyncGenerator<ZoomStreamEvent> {
			yield attempt;
			await tick();
			throw new Error('boom');
		}

		const a = flights.join('k', failing);
		const b = flights.join('k', failing);
		const expected = [attempt, { type: 'error', code: 'internal_error', message: 'boom' }];

		expect(await collect(a)).toEqual(expected);
		expect(await collect(b)).toEqual(expected);
	});
});
