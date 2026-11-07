// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isRecord } from '@szrs/llm-proxy/zoom/saved-blocks.js';

/** What an alias resolves to. An alias is a name in LiteLLM's config; the model is what matters. */
export interface ModelIdentity {
	/** The model, without its provider and maker: "glm-5.3-flash". */
	model: string;
	provider?: string;
	vendor?: string;
	/** LiteLLM's full model string. */
	litellmModel: string;
}

/** The model a full LiteLLM model string names ("openrouter/z-ai/glm-5.3-flash"), for models that are not aliases. */
export function identityFromModelString(litellmModel: string): ModelIdentity {
	const parts = litellmModel.split('/');
	return {
		model: parts[parts.length - 1] ?? litellmModel,
		...(parts.length > 1 && { provider: parts[0] }),
		...(parts.length > 2 && { vendor: parts[1] }),
		litellmModel
	};
}

/** Reads, from LiteLLM, the model each alias is configured with. Read-only; the same shape the spike records. */
export async function fetchModels(
	config: { baseUrl: string; key: string },
	wanted: string[]
): Promise<Record<string, ModelIdentity>> {
	const res = await fetch(`${config.baseUrl}/v1/model/info`, {
		headers: { authorization: `Bearer ${config.key}` }
	});
	const body: unknown = await res.json();
	const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
	const found: Record<string, ModelIdentity> = {};
	for (const entry of entries) {
		if (!isRecord(entry) || typeof entry.model_name !== 'string') continue;
		if (!wanted.includes(entry.model_name)) continue;
		const params = isRecord(entry.litellm_params) ? entry.litellm_params : {};
		const info = isRecord(entry.model_info) ? entry.model_info : {};
		const litellmModel = typeof params.model === 'string' ? params.model : entry.model_name;
		const parts = litellmModel.split('/');
		found[entry.model_name] = {
			model: parts[parts.length - 1] ?? litellmModel,
			provider:
				typeof info.litellm_provider === 'string'
					? info.litellm_provider
					: parts.length > 1
						? parts[0]
						: undefined,
			vendor: parts.length > 2 ? parts[1] : undefined,
			litellmModel
		};
	}
	return found;
}

/** The names LiteLLM serves, aliases and wildcard routes ("openrouter/*") alike. Read-only. */
export async function fetchRouteNames(config: { baseUrl: string; key: string }): Promise<string[]> {
	const res = await fetch(`${config.baseUrl}/v1/model/info`, {
		headers: { authorization: `Bearer ${config.key}` }
	});
	const body: unknown = await res.json();
	const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
	return entries.flatMap((entry) =>
		isRecord(entry) && typeof entry.model_name === 'string' ? [entry.model_name] : []
	);
}

/** Whether a route is named exactly, or a wildcard route ("openrouter/*") covers the model. */
export function isServed(model: string, routes: string[]): boolean {
	return routes.some(
		(route) => route === model || (route.endsWith('/*') && model.startsWith(route.slice(0, -1)))
	);
}
