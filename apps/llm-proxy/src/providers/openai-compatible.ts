import { SpanStatusCode, trace } from '@opentelemetry/api';
import { z } from 'zod';

import type { ChatCompletionParams, ChatCompletionResult, Provider } from './types.js';

const tracer = trace.getTracer('llm-proxy');

const UpstreamResponseSchema = z.object({
	model: z.string(),
	choices: z
		.array(
			z.object({
				message: z.object({ content: z.string() }),
				finish_reason: z.string()
			})
		)
		.min(1),
	usage: z.object({
		prompt_tokens: z.number().int().nonnegative(),
		completion_tokens: z.number().int().nonnegative(),
		total_tokens: z.number().int().nonnegative()
	})
});

export interface OpenAiCompatibleConfig {
	baseUrl: string;
	apiKey?: string;
	defaultModel?: string;
}

export class OpenAiCompatibleProvider implements Provider {
	readonly id: string;
	private readonly config: OpenAiCompatibleConfig;

	constructor(id: string, config: OpenAiCompatibleConfig) {
		this.id = id;
		this.config = config;
	}

	async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
		return tracer.startActiveSpan('llm.chat', async (span) => {
			span.setAttribute('llm.provider', this.id);
			span.setAttribute('llm.model', params.model || (this.config.defaultModel ?? ''));

			try {
				const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
					},
					body: JSON.stringify({
						model: params.model || this.config.defaultModel,
						messages: params.messages,
						temperature: params.temperature,
						max_tokens: params.maxTokens
					})
				});

				if (!response.ok) {
					throw new Error(`Upstream provider "${this.id}" returned ${response.status}`);
				}

				const upstream = UpstreamResponseSchema.parse(await response.json());
				const choice = upstream.choices[0];

				return {
					content: choice.message.content,
					model: upstream.model,
					usage: {
						promptTokens: upstream.usage.prompt_tokens,
						completionTokens: upstream.usage.completion_tokens,
						totalTokens: upstream.usage.total_tokens
					},
					finishReason: choice.finish_reason
				};
			} catch (error) {
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw error;
			} finally {
				span.end();
			}
		});
	}
}
