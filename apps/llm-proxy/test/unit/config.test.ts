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
		expect(config.CORS_ORIGINS).toEqual([]);
		expect(config.RATE_LIMIT_MAX).toBe(60);
		expect(config.RATE_LIMIT_WINDOW).toBe('1 minute');
		expect(config.TRUST_PROXY).toBe(false);
	});

	it('treats INTERNAL_API_KEY as optional, and empty as unset', () => {
		expect(loadConfig({ LITELLM_VIRTUAL_KEY: 'test-key' }).INTERNAL_API_KEY).toBeUndefined();
		expect(
			loadConfig({ LITELLM_VIRTUAL_KEY: 'test-key', INTERNAL_API_KEY: '' }).INTERNAL_API_KEY
		).toBeUndefined();
	});

	it('splits and trims CORS_ORIGINS', () => {
		const config = loadConfig({
			LITELLM_VIRTUAL_KEY: 'test-key',
			CORS_ORIGINS: 'https://a.example, http://localhost:8080 ,'
		});

		expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'http://localhost:8080']);
	});

	it('parses TRUST_PROXY as a boolean', () => {
		expect(loadConfig({ LITELLM_VIRTUAL_KEY: 'test-key', TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(
			true
		);
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
