// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Caching and cancellation for zoom requests.
 */
import type { ZoomResponse } from '@szrs/llm-proxy-contracts';
import type { ZoomProgressEvent, ZoomTarget } from './zoom_client';

export type ZoomRequester = (
	target: ZoomTarget,
	init: { onProgress: (event: ZoomProgressEvent) => void; signal: AbortSignal }
) => Promise<ZoomResponse>;

/**
 * Keeps each model's result for the last workspace it zoomed, so switching
 * levels (or models) back and forth doesn't call the proxy again, and makes
 * sure at most one request is in flight: asking for the same target again
 * joins it, asking for a different one aborts it.
 */
export class ZoomSession {
	private readonly cached = new Map<string, { key: string; result: ZoomResponse }>();
	private pending: {
		key: string;
		controller: AbortController;
		promise: Promise<ZoomResponse>;
	} | null = null;

	constructor(
		private readonly request: ZoomRequester,
		private readonly onProgress: (event: ZoomProgressEvent) => void = () => {},
		private readonly getModel: () => string = () => ''
	) {}

	zoom(target: ZoomTarget): Promise<ZoomResponse> {
		const model = this.getModel();
		const targetKey = JSON.stringify(target);
		const hit = this.cached.get(model);
		if (hit?.key === targetKey) return Promise.resolve(hit.result);
		const key = this.keyFor(target);
		if (this.pending?.key === key) return this.pending.promise;

		this.cancel();
		const controller = new AbortController();
		const promise = this.request(target, {
			onProgress: this.onProgress,
			signal: controller.signal
		}).then(
			(result) => {
				this.clearPending(promise);
				this.cached.set(model, { key: targetKey, result });
				return result;
			},
			(error: unknown) => {
				this.clearPending(promise);
				throw error;
			}
		);
		this.pending = { key, controller, promise };
		return promise;
	}

	/** Makes the cached result also apply to `target`, e.g. after an edit that only changed bound values. */
	retarget(target: ZoomTarget): void {
		const entry = this.cached.get(this.getModel());
		if (entry) entry.key = JSON.stringify(target);
	}

	/** Drops the cached results, so the next zoom asks the proxy again. */
	forget(): void {
		this.cached.clear();
	}

	/** Aborts the in-flight request, if any. Its promise rejects with an AbortError. */
	cancel(): void {
		this.pending?.controller.abort();
		this.pending = null;
	}

	/** Identifies a request, which is per model so a model switch doesn't join another model's. */
	private keyFor(target: ZoomTarget): string {
		return JSON.stringify({ model: this.getModel(), ...target });
	}

	private clearPending(promise: Promise<ZoomResponse>): void {
		if (this.pending?.promise === promise) this.pending = null;
	}
}
