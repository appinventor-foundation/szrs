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
 * Keeps the result for the last zoomed workspace, so switching levels back
 * and forth doesn't call the proxy again, and makes sure at most one request
 * is in flight: asking for the same target again joins it, asking for a
 * different one aborts it.
 */
export class ZoomSession {
	private cached: { key: string; result: ZoomResponse } | null = null;
	private pending: {
		key: string;
		controller: AbortController;
		promise: Promise<ZoomResponse>;
	} | null = null;

	constructor(
		private readonly request: ZoomRequester,
		private readonly onProgress: (event: ZoomProgressEvent) => void = () => {}
	) {}

	zoom(target: ZoomTarget): Promise<ZoomResponse> {
		const key = JSON.stringify(target);
		if (this.cached?.key === key) return Promise.resolve(this.cached.result);
		if (this.pending?.key === key) return this.pending.promise;

		this.cancel();
		const controller = new AbortController();
		const promise = this.request(target, {
			onProgress: this.onProgress,
			signal: controller.signal
		}).then(
			(result) => {
				this.clearPending(promise);
				this.cached = { key, result };
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

	/** Aborts the in-flight request, if any. Its promise rejects with an AbortError. */
	cancel(): void {
		this.pending?.controller.abort();
		this.pending = null;
	}

	private clearPending(promise: Promise<ZoomResponse>): void {
		if (this.pending?.promise === promise) this.pending = null;
	}
}
