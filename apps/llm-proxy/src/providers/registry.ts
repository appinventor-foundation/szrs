import type { Config } from '../config.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { Provider } from './types.js';

export class ProviderRegistry {
	private readonly providersByModel = new Map<string, Provider>();

	constructor(config: Config) {
		if (config.OPENAI_API_KEY) {
			const openai = new OpenAiCompatibleProvider('openai', {
				baseUrl: config.OPENAI_BASE_URL,
				apiKey: config.OPENAI_API_KEY,
				defaultModel: config.OPENAI_DEFAULT_MODEL
			});
			this.providersByModel.set(config.OPENAI_DEFAULT_MODEL, openai);
		}

		if (config.SELF_HOSTED_BASE_URL && config.SELF_HOSTED_MODEL) {
			const selfHosted = new OpenAiCompatibleProvider('self-hosted', {
				baseUrl: config.SELF_HOSTED_BASE_URL,
				defaultModel: config.SELF_HOSTED_MODEL
			});
			this.providersByModel.set(config.SELF_HOSTED_MODEL, selfHosted);
		}
	}

	get(model: string): Provider {
		const provider = this.providersByModel.get(model);
		if (!provider) {
			throw new Error(`No provider configured for model "${model}"`);
		}
		return provider;
	}
}
