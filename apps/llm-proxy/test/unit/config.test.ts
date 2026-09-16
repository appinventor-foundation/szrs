import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
	it('applies defaults for optional values', () => {
		const config = loadConfig({
			INTERNAL_API_KEY: 'test-secret',
			LITELLM_VIRTUAL_KEY: 'test-key'
		});

		expect(config.PORT).toBe(3000);
		expect(config.DEPLOYMENT_ENVIRONMENT).toBe('development');
		expect(config.LITELLM_BASE_URL).toBe('http://localhost:4000');
	});

	it('throws when a required value is missing', () => {
		expect(() => loadConfig({ INTERNAL_API_KEY: 'test-secret' })).toThrow();
	});

	it('coerces PORT from a string env var', () => {
		const config = loadConfig({
			INTERNAL_API_KEY: 'test-secret',
			LITELLM_VIRTUAL_KEY: 'test-key',
			PORT: '4000'
		});

		expect(config.PORT).toBe(4000);
	});
});
