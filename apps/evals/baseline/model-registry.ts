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
	notes?: string;
}

const pin = (...order: string[]): RequestExtras => ({
	provider: { order, allow_fallbacks: false }
});

/**
 * The models of the baseline. Add one here to benchmark it; nothing else is
 * needed. It is not added to LiteLLM's config or to the dashboard's list: the
 * caller names the model in each request.
 */
export const benchmarkModels: BenchmarkModel[] = [
	{
		id: 'glm-5.3-flash',
		model: 'openrouter/z-ai/glm-5.3-flash',
		request: pin('z-ai'),
		notes:
			'Z.AI, the maker’s own endpoint (fp8). Reasoning is mandatory and defaults to max effort.'
	},
	{
		id: 'deepseek-v4.1-flash-1017',
		model: 'openrouter/deepseek/deepseek-v4.1-flash-1017',
		request: pin('deepinfra'),
		notes:
			'DeepInfra (fp8). DeepSeek’s own endpoint is excluded by the OpenRouter account’s privacy setting.'
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
