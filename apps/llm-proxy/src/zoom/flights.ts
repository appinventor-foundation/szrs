import type { ZoomStreamEvent } from '@szrs/llm-proxy-contracts';

interface Flight {
	/** Everything the run has produced so far, for subscribers that join late. */
	events: ZoomStreamEvent[];
	finished: boolean;
	/** Every subscriber has left, so the run should stop. */
	abandoned: boolean;
	subscribers: number;
	/** Subscribers waiting for the next event. */
	waiting: (() => void)[];
}

export interface Subscription {
	/** The run's events from the start (replayed if it was already under way), then live ones. */
	events: AsyncGenerator<ZoomStreamEvent>;
	/** This subscriber is gone. Safe to call more than once, and before `events` is read. */
	close(): void;
	/** False for the request that started the run. */
	joined: boolean;
}

/**
 * Makes requests for the same thing share one run. The first request for a
 * key starts the run; requests that arrive while it is still going attach to
 * it and get the same events, so a crowd asking for the same zoom costs one
 * model call. This only coordinates within one process.
 *
 * The run belongs to its subscribers collectively, not to the request that
 * started it: it carries on while any subscriber is left, and stops (which
 * cancels whatever upstream request it is making) when the last one leaves.
 */
export class ZoomFlights {
	private readonly flights = new Map<string, Flight>();

	join(key: string, start: () => AsyncGenerator<ZoomStreamEvent>): Subscription {
		let flight = this.flights.get(key);
		const joined = flight !== undefined;
		if (!flight) {
			flight = { events: [], finished: false, abandoned: false, subscribers: 0, waiting: [] };
			this.flights.set(key, flight);
		}
		// Counted now, not when the subscriber starts reading, so the run can't see
		// "nobody is listening" in the gap before the response begins.
		flight.subscribers++;
		if (!joined) void this.run(key, flight, start());

		const current = flight;
		let closed = false;
		const close = (): void => {
			if (closed) return;
			closed = true;
			current.subscribers--;
			if (current.subscribers === 0 && !current.finished) {
				current.abandoned = true;
				// Later requests start a new run rather than joining one that is stopping.
				if (this.flights.get(key) === current) this.flights.delete(key);
			}
		};

		async function* events(): AsyncGenerator<ZoomStreamEvent> {
			try {
				for (let next = 0; ;) {
					while (next < current.events.length) yield current.events[next++];
					if (current.finished) return;
					await new Promise<void>((resolve) => current.waiting.push(resolve));
				}
			} finally {
				close();
			}
		}

		return { events: events(), close, joined };
	}

	private async run(
		key: string,
		flight: Flight,
		events: AsyncGenerator<ZoomStreamEvent>
	): Promise<void> {
		try {
			for await (const event of events) {
				push(flight, event);
				// Breaking out of the loop stops the generator, which cancels the upstream
				// request. A finished result is let through, so it can still be stored.
				if (flight.abandoned && event.type !== 'done') break;
			}
		} catch (error) {
			push(flight, {
				type: 'error',
				code: 'internal_error',
				message: error instanceof Error ? error.message : String(error)
			});
		} finally {
			flight.finished = true;
			wake(flight);
			if (this.flights.get(key) === flight) this.flights.delete(key);
		}
	}
}

function push(flight: Flight, event: ZoomStreamEvent): void {
	flight.events.push(event);
	wake(flight);
}

function wake(flight: Flight): void {
	for (const resolve of flight.waiting.splice(0)) resolve();
}
