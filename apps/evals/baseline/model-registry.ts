// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Extra fields sent with every request for a model, beyond what the proxy sends
 * in production. They are OpenRouter's own request fields, which LiteLLM passes
 * through (checked 2026-11-07, see results/*-openrouter-params.md): pin one
 * provider so a model is not served by a different host, with a different
 * quantization, from one call to the next; and, optionally, set how much the
 * model reasons.
 */
export interface RequestExtras {
	provider?: {
		/** Provider slugs to try, in order ("z-ai", "deepinfra"). */
		order?: string[];
		/** False makes the request fail rather than go to another provider. */
		allow_fallbacks?: boolean;
		only?: string[];
		quantizations?: string[];
	};
	reasoning?: {
		effort?: 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';
		max_tokens?: number;
		exclude?: boolean;
	};
}

/** A model the baseline can run, with the conditions it runs under. */
export interface BenchmarkModel {
	/** The name used by --models and shown in reports. Stable: results refer to it. */
	id: string;
	/**
	 * What is sent as `model` to LiteLLM: normally a full OpenRouter model string
	 * ("openrouter/z-ai/glm-5.3-flash"), which LiteLLM's local wildcard route sends
	 * on (infra/llm-proxy/docker-compose.benchmark.yml, local only). It can also be
	 * an alias from LiteLLM's own config, in which case set `expect`.
	 */
	model: string;
	/** For an alias: the model it must turn out to be, so a repointed alias cannot be measured by mistake. */
	expect?: string;
	request?: RequestExtras;
	/**
	 * Overrides of the shared sampling parameters (prompts/params.ts), for a model that
	 * does not accept one. `temperature: null` sends none. Recorded with every result.
	 */
	params?: { temperature?: number | null; maxTokens?: number };
	notes?: string;
}

/** The sampling parameters a model is called with: the prompt's, with the model's own changes. */
export function effectiveParams(
	shared: { temperature?: number; maxTokens?: number },
	overrides: BenchmarkModel['params'] = {}
): { temperature?: number; maxTokens?: number } {
	const merged = { ...shared, ...overrides };
	const { temperature, ...rest } = merged;
	return { ...rest, ...(typeof temperature === 'number' && { temperature }) };
}

const pin = (...order: string[]): RequestExtras => ({
	provider: { order, allow_fallbacks: false }
});

/**
 * The ten models of the baseline (chosen 2026-11-07). Pins follow one rule:
 * the maker\u2019s own endpoint where it is available to this account, otherwise a host serving
 * the weights at bf16 or fp8, with a maximum output of at least the 32768-token cap. A pin is
 * only known to work once a request has been served by it (pnpm baseline:run stops on a
 * 404 and says so). Add one here to benchmark it; nothing else is
 * needed. It is not added to LiteLLM's config or to the dashboard's list: the
 * caller names the model in each request.
 */
export const benchmarkModels: BenchmarkModel[] = [
	{
		id: 'qwen3-coder-next',
		model: 'openrouter/qwen/qwen3-coder-next',
		request: pin('parasail'),
		notes: 'The only endpoint (bf16). Not a reasoning model.'
	},
	{
		id: 'qwen3.8-27b',
		model: 'openrouter/qwen/qwen3.8-27b',
		request: pin('deepinfra'),
		notes: 'DeepInfra (bf16). Reasoning is optional and defaults to xhigh effort.'
	},
	{
		id: 'gemma-4-26b-a4b-it',
		model: 'openrouter/google/gemma-4-26b-a4b-it',
		request: pin('coreweave'),
		notes: 'CoreWeave (bf16).'
	},
	{
		id: 'gpt-oss-20b',
		model: 'openrouter/openai/gpt-oss-20b',
		request: pin('deepinfra'),
		notes:
			'DeepInfra (bf16). The weights are released in MXFP4, so fp4 hosts are also faithful. Reasoning is mandatory.'
	},
	{
		id: 'deepseek-v4.1-flash-1017',
		model: 'openrouter/deepseek/deepseek-v4.1-flash-1017',
		request: pin('deepinfra'),
		notes:
			'The newer DeepSeek flash release, chosen over deepseek-v4.1-flash. DeepInfra (fp8): DeepSeek\u2019s own endpoint is excluded by the OpenRouter account\u2019s privacy setting.'
	},
	{
		id: 'glm-5.3-flash',
		model: 'openrouter/z-ai/glm-5.3-flash',
		request: pin('z-ai'),
		notes:
			'Z.AI, the maker\u2019s own endpoint (fp8). Reasoning is mandatory and defaults to max effort.'
	},
	{
		id: 'minimax-m3',
		model: 'openrouter/minimax/minimax-m3',
		request: pin('minimax'),
		notes: 'MiniMax, the maker\u2019s own endpoint.'
	},
	{
		id: 'gemini-3.5-flash-lite',
		model: 'openrouter/google/gemini-3.5-flash-lite',
		request: pin('google-ai-studio'),
		notes:
			'Google AI Studio (standard tier; the Vertex endpoints do not list temperature). Reasoning is mandatory and defaults to minimal.'
	},
	{
		id: 'gpt-5.4-nano',
		model: 'openrouter/openai/gpt-5.4-nano',
		request: pin('openai'),
		params: { temperature: null },
		notes:
			'OpenAI, the maker\u2019s own endpoint. The model does not support temperature, so none is sent.'
	},
	{
		id: 'claude-haiku-5.5',
		model: 'openrouter/anthropic/claude-haiku-5.5',
		request: pin('anthropic'),
		params: { temperature: null },
		notes:
			'Anthropic, the maker\u2019s own endpoint. The model does not support temperature, so none is sent.'
	}
];

export function findBenchmarkModel(id: string): BenchmarkModel {
	const found = benchmarkModels.find((model) => model.id === id);
	if (!found) {
		throw new Error(
			`Unknown model "${id}". Known: ${benchmarkModels.map((model) => model.id).join(', ')}. Add it to baseline/model-registry.ts.`
		);
	}
	return found;
}
