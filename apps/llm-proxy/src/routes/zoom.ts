import { Readable } from 'node:stream';

import {
	ZoomRequestSchema,
	type ZoomRequest,
	type ZoomStreamEvent
} from '@szrs/llm-proxy-contracts';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import type { Config } from '../config.js';
import { chatCompletion, chatCompletionStream } from '../lib/litellm.js';
import {
	classifyError,
	logAttempt,
	traceMetadata,
	truncationMessage
} from '../zoom/attempt-log.js';
import { lookupZoom, type ZoomCache } from '../zoom/cache.js';
import { zoomCacheKey } from '../zoom/cache-key.js';
import { ZoomFlights } from '../zoom/flights.js';
import { normalizeWorkspace, restoreIds } from '../zoom/normalize.js';
import { buildOutline } from '../zoom/outline.js';
import { getZoomPrompt, type ZoomPrompt } from '../zoom/prompts/index.js';
import { buildZoomMessages, MAX_ATTEMPTS, parseZoomResponse } from '../zoom/zoom.js';

export default async function zoomRoutes(fastify: FastifyInstance): Promise<void> {
	// Streaming requests for the same program share one model call while it runs.
	const flights = new ZoomFlights();

	fastify.post('/v1/zoom', async (request, reply) => {
		const body = ZoomRequestSchema.parse(request.body);
		// The model works on, and answers in, a canonical copy of the workspace.
		const { workspaceJson, originalIds } = normalizeWorkspace(body.workspaceJson);
		const canonical = { ...body, workspaceJson };
		const prompt = getZoomPrompt();

		const key = zoomCacheKey({ ...canonical, promptId: prompt.id });
		const cached = await lookupZoom(fastify.zoomCache, key, workspaceJson, request.log);
		if (cached) return restoreIds(cached, originalIds);

		const size = outlineSize(workspaceJson);
		let lastError: string | undefined;

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const started = performance.now();
			const result = await chatCompletion(
				fastify.config,
				{
					model: body.model,
					messages: buildZoomMessages(canonical, lastError, prompt.id),
					...prompt.params
				},
				{ metadata: traceMetadata(prompt.id) }
			);
			if (!result.ok) {
				request.log.warn(
					{ attempt, status: result.status, body: result.body },
					'LiteLLM request failed'
				);
				return reply.code(result.status).send(result.body);
			}

			const { finishReason, usage } = result.response;
			const record = {
				promptId: prompt.id,
				model: body.model,
				outline: size,
				attempt,
				finishReason,
				usage,
				latencyMs: Math.round(performance.now() - started)
			};

			// Cut off by the output limit: a retry would be cut off in the same place.
			if (finishReason === 'length') {
				logAttempt(request.log, { ...record, outcome: 'truncated', repairs: [] });
				return reply.code(502).send({
					error: {
						message: truncationMessage(usage.completionTokens),
						code: 'invalid_model_output'
					}
				});
			}

			try {
				const {
					result: zoom,
					repairs,
					plan
				} = parseZoomResponse(result.response.content, canonical.workspaceJson);
				logAttempt(request.log, { ...record, outcome: 'ok', repairs, plan });
				// Stored in canonical ids, so anyone with the same program can use it.
				void fastify.zoomCache?.set(key, zoom);
				return restoreIds(zoom, originalIds);
			} catch (error) {
				lastError = errorMessage(error);
				logAttempt(request.log, { ...record, outcome: classifyError(error), repairs: [] });
				request.log.warn({ attempt, error: lastError }, 'invalid zoom output from model');
			}
		}

		return reply
			.code(502)
			.send({ error: { message: lastError ?? '', code: 'invalid_model_output' } });
	});

	// Validation errors still get a plain 400; once streaming starts the status
	// is committed to 200, so every later failure is sent as an `error` event.
	fastify.post('/v1/zoom/stream', async (request, reply) => {
		const body = ZoomRequestSchema.parse(request.body);
		const { workspaceJson, originalIds } = normalizeWorkspace(body.workspaceJson);
		const canonical = { ...body, workspaceJson };
		const prompt = getZoomPrompt();
		const key = zoomCacheKey({ ...canonical, promptId: prompt.id });

		let events: AsyncGenerator<ZoomStreamEvent>;
		const cached = await lookupZoom(fastify.zoomCache, key, workspaceJson, request.log);
		if (cached) {
			events = only({ type: 'done', result: restoreIds(cached, originalIds), cached: true });
		} else {
			const flight = flights.join(key, () =>
				runZoom(fastify.config, fastify.zoomCache, canonical, key, prompt, request.log)
			);
			request.log.info({ flight: flight.joined ? 'joined' : 'started', key }, 'zoom flight');
			// However the response ends, this request stops counting as a listener.
			reply.raw.on('close', flight.close);
			events = withOwnIds(flight.events, originalIds);
		}

		reply.type('text/event-stream').header('cache-control', 'no-cache');
		return Readable.from(toSse(events, request.log));
	});
}

// The model's side of a zoom: asks, retries and validates. Its events are in
// canonical ids, so they can be shared between requests (see withOwnIds).
async function* runZoom(
	config: Config,
	cache: ZoomCache | null,
	canonical: ZoomRequest,
	key: string,
	prompt: ZoomPrompt,
	log: FastifyBaseLogger
): AsyncGenerator<ZoomStreamEvent> {
	const size = outlineSize(canonical.workspaceJson);
	let lastError: string | undefined;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		yield { type: 'attempt', attempt, maxAttempts: MAX_ATTEMPTS, previousError: lastError };

		const started = performance.now();
		const result = await chatCompletionStream(
			config,
			{
				model: canonical.model,
				messages: buildZoomMessages(canonical, lastError, prompt.id),
				...prompt.params
			},
			{ metadata: traceMetadata(prompt.id) }
		);
		if (!result.ok) {
			log.warn({ attempt, status: result.status, body: result.body }, 'LiteLLM request failed');
			yield {
				type: 'error',
				code: 'upstream_error',
				status: result.status,
				message: upstreamErrorMessage(result.body, result.status)
			};
			return;
		}

		let text = '';
		for await (const token of result.tokens) {
			text += token;
			yield { type: 'token', text: token };
		}

		const { finishReason, usage } = result.summary;
		const record = {
			promptId: prompt.id,
			model: canonical.model,
			outline: size,
			attempt,
			finishReason,
			usage,
			latencyMs: Math.round(performance.now() - started)
		};

		// Cut off by the output limit: a retry would be cut off in the same place.
		if (finishReason === 'length') {
			logAttempt(log, { ...record, outcome: 'truncated', repairs: [] });
			yield {
				type: 'error',
				code: 'invalid_model_output',
				message: truncationMessage(usage?.completionTokens)
			};
			return;
		}

		try {
			const { result: zoom, repairs, plan } = parseZoomResponse(text, canonical.workspaceJson);
			logAttempt(log, { ...record, outcome: 'ok', repairs, plan });
			yield { type: 'done', result: zoom };
			// Everyone listening has the result by now. Keeping the run open until it
			// is stored means a request arriving in between joins it instead of
			// starting another model call.
			await cache?.set(key, zoom);
			return;
		} catch (error) {
			lastError = errorMessage(error);
			logAttempt(log, { ...record, outcome: classifyError(error), repairs: [] });
			log.warn({ attempt, error: lastError }, 'invalid zoom output from model');
		}
	}

	yield { type: 'error', code: 'invalid_model_output', message: lastError ?? '' };
}

// Shared events are in canonical ids; each request gets the result in its own.
async function* withOwnIds(
	events: AsyncGenerator<ZoomStreamEvent>,
	originalIds: Map<string, string>
): AsyncGenerator<ZoomStreamEvent> {
	for await (const event of events) {
		yield event.type === 'done'
			? { ...event, result: restoreIds(event.result, originalIds) }
			: event;
	}
}

async function* only(event: ZoomStreamEvent): AsyncGenerator<ZoomStreamEvent> {
	yield event;
}

async function* toSse(
	events: AsyncGenerator<ZoomStreamEvent>,
	log: FastifyBaseLogger
): AsyncGenerator<string> {
	try {
		for await (const event of events) {
			yield `data: ${JSON.stringify(event)}\n\n`;
		}
	} catch (error) {
		log.error(error);
		const event: ZoomStreamEvent = {
			type: 'error',
			code: 'internal_error',
			message: errorMessage(error)
		};
		yield `data: ${JSON.stringify(event)}\n\n`;
	}
}

function upstreamErrorMessage(body: unknown, status: number): string {
	const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
	return typeof message === 'string' ? message : `LiteLLM returned ${status}`;
}

// For the attempt log: how big the program is.
function outlineSize(workspaceJson: Record<string, unknown>): { blocks: number; stacks: number } {
	const outline = buildOutline(workspaceJson);
	return { blocks: outline.blocks, stacks: outline.stacks.length };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
