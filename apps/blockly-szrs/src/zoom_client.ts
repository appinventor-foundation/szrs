// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Client for the llm-proxy's streaming semantic zoom endpoint.
 */
import type { ModelsResponse, ZoomResponse, ZoomStreamEvent } from '@szrs/llm-proxy-contracts';

export interface ZoomClientOptions {
	/** Base URL of this site's llm-proxy, e.g. "https://proxy.example.org". */
	proxyUrl: string;
	/** The LiteLLM model alias the proxy should use. */
	model: string;
	/**
	 * Sent as x-internal-api-key, for proxies that require one. It is visible
	 * to anyone using the site, so it identifies the caller; it isn't a secret.
	 */
	apiKey?: string;
}

/** What to zoom: the Detail-level workspace and a name for the program. */
export interface ZoomTarget {
	/** Becomes the prefix of generated block types, e.g. "fizz-buzz-n". */
	slug: string;
	workspaceJson: Record<string, unknown>;
}

/**
 * The non-final events: an attempt starting, a chunk of model output, or
 * (just before the result) notice that the proxy had the result stored and
 * didn't call a model.
 */
export type ZoomProgressEvent =
	Extract<ZoomStreamEvent, { type: 'attempt' | 'token' }> | { type: 'cached' };

export type ZoomErrorCode =
	Extract<ZoomStreamEvent, { type: 'error' }>['code'] | 'request_failed' | 'incomplete_stream';

export class ZoomError extends Error {
	constructor(
		message: string,
		readonly code: ZoomErrorCode,
		readonly status?: number
	) {
		super(message);
		this.name = 'ZoomError';
	}
}

/**
 * Asks the proxy for the Semantic and Concept levels of a workspace.
 *
 * Resolves with the validated result. Rejects with a ZoomError if the proxy
 * refuses the request or the zoom fails, or with an AbortError if `signal`
 * is aborted.
 */
export async function requestZoom(
	options: ZoomClientOptions,
	target: ZoomTarget,
	{
		onProgress,
		signal
	}: { onProgress?: (event: ZoomProgressEvent) => void; signal?: AbortSignal } = {}
): Promise<ZoomResponse> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (options.apiKey) headers['x-internal-api-key'] = options.apiKey;

	const response = await fetch(`${options.proxyUrl.replace(/\/+$/, '')}/v1/zoom/stream`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ model: options.model, ...target }),
		signal
	});
	if (!response.ok || !response.body) {
		throw await requestFailed(response);
	}

	// The proxy sends each event as a `data: {json}` line followed by a blank
	// line. A network chunk can end mid-event, so the remainder is buffered.
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const chunks = buffer.split('\n\n');
		buffer = chunks.pop() ?? '';

		for (const chunk of chunks) {
			if (!chunk.startsWith('data: ')) continue;
			const event = JSON.parse(chunk.slice('data: '.length)) as ZoomStreamEvent;

			if (event.type === 'done') {
				if (event.cached) onProgress?.({ type: 'cached' });
				await reader.cancel();
				return event.result;
			}
			if (event.type === 'error') {
				await reader.cancel();
				throw new ZoomError(event.message, event.code, event.status);
			}
			onProgress?.(event);
		}
	}

	throw new ZoomError('The zoom stream ended without a result', 'incomplete_stream');
}

/**
 * Asks the proxy which model aliases it will accept.
 *
 * Resolves with the aliases. Rejects with a ZoomError if the proxy refuses
 * the request, or with an AbortError if `signal` is aborted.
 */
export async function fetchModels(
	options: Pick<ZoomClientOptions, 'proxyUrl' | 'apiKey'>,
	signal?: AbortSignal
): Promise<string[]> {
	const headers: Record<string, string> = {};
	if (options.apiKey) headers['x-internal-api-key'] = options.apiKey;

	const response = await fetch(`${options.proxyUrl.replace(/\/+$/, '')}/v1/models`, {
		headers,
		signal
	});
	if (!response.ok) throw await requestFailed(response);

	return ((await response.json()) as ModelsResponse).models;
}

async function requestFailed(response: Response): Promise<ZoomError> {
	let message = `The proxy returned ${response.status}`;
	try {
		const body = (await response.json()) as { error?: { message?: unknown } };
		if (typeof body.error?.message === 'string') message = body.error.message;
	} catch {
		// Not the proxy's JSON error shape; keep the generic message.
	}
	return new ZoomError(message, 'request_failed', response.status);
}
