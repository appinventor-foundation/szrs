import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
	it('applies defaults for optional values', () => {
		const config = loadConfig({
			DATABASE_URL: 'postgresql://localhost:5432/llm_proxy',
			INTERNAL_API_KEY: 'test-secret'
		});

		expect(config.PORT).toBe(3000);
		expect(config.DEPLOYMENT_ENVIRONMENT).toBe('development');
		expect(config.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
	});

	it('throws when a required value is missing', () => {
		expect(() => loadConfig({ INTERNAL_API_KEY: 'test-secret' })).toThrow();
	});

	it('coerces PORT from a string env var', () => {
		const config = loadConfig({
			DATABASE_URL: 'postgresql://localhost:5432/llm_proxy',
			INTERNAL_API_KEY: 'test-secret',
			PORT: '4000'
		});

		expect(config.PORT).toBe(4000);
	});
});
