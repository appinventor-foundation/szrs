import { Readable } from 'node:stream';

import {
	ZoomRequestSchema,
	type ZoomRequest,
	type ZoomStreamEvent
} from '@szrs/llm-proxy-contracts';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import type { Config } from '../config.js';
import { chatCompletion, chatCompletionStream } from '../lib/litellm.js';
import { normalizeWorkspace, restoreIds } from '../zoom/normalize.js';
import { buildZoomMessages, MAX_ATTEMPTS, parseZoomResponse } from '../zoom/zoom.js';

export default async function zoomRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.post('/v1/zoom', async (request, reply) => {
		const body = ZoomRequestSchema.parse(request.body);
		// The model works on, and answers in, a canonical copy of the workspace.
		const { workspaceJson, originalIds } = normalizeWorkspace(body.workspaceJson);
		const canonical = { ...body, workspaceJson };

		let lastError: string | undefined;

		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			const result = await chatCompletion(fastify.config, {
				model: body.model,
				messages: buildZoomMessages(canonical, lastError)
			});
			if (!result.ok) {
				request.log.warn(
					{ attempt, status: result.status, body: result.body },
					'LiteLLM request failed'
				);
				return reply.code(result.status).send(result.body);
			}

			try {
				const { result: zoom, repairs } = parseZoomResponse(
					result.response.content,
					canonical.workspaceJson
				);
				if (repairs.length > 0) request.log.info({ attempt, repairs }, 'repaired zoom output');
				return restoreIds(zoom, originalIds);
			} catch (error) {
				lastError = errorMessage(error);
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

		reply.type('text/event-stream').header('cache-control', 'no-cache');
		return Readable.from(toSse(zoomEvents(fastify.config, body, request.log), request.log));
	});
}

async function* zoomEvents(
	config: Config,
	body: ZoomRequest,
	log: FastifyBaseLogger
): AsyncGenerator<ZoomStreamEvent> {
	const { workspaceJson, originalIds } = normalizeWorkspace(body.workspaceJson);
	const canonical = { ...body, workspaceJson };
	let lastError: string | undefined;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		yield { type: 'attempt', attempt, maxAttempts: MAX_ATTEMPTS, previousError: lastError };

		const result = await chatCompletionStream(config, {
			model: body.model,
			messages: buildZoomMessages(canonical, lastError)
		});
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

		try {
			const { result: zoom, repairs } = parseZoomResponse(text, canonical.workspaceJson);
			if (repairs.length > 0) log.info({ attempt, repairs }, 'repaired zoom output');
			yield { type: 'done', result: restoreIds(zoom, originalIds) };
			return;
		} catch (error) {
			lastError = errorMessage(error);
			log.warn({ attempt, error: lastError }, 'invalid zoom output from model');
		}
	}

	yield { type: 'error', code: 'invalid_model_output', message: lastError ?? '' };
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
