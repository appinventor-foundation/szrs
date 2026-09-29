import { z } from 'zod';

// Unset and empty (`KEY=` in an env file) both mean "not configured".
const optionalString = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().optional()
);

const EnvSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3000),
	// When unset, requests are not authenticated: the usual setup when the only
	// caller is the Blockly plugin in a browser, where any key would be visible.
	INTERNAL_API_KEY: optionalString,
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
	DEPLOYMENT_ENVIRONMENT: z.string().default('development'),
	LITELLM_BASE_URL: z.string().default('http://localhost:4000'),
	LITELLM_VIRTUAL_KEY: z.string(),
	// Comma-separated browser origins allowed to call the proxy. Empty means no
	// cross-origin access.
	CORS_ORIGINS: z
		.string()
		.default('')
		.transform((value) =>
			value
				.split(',')
				.map((origin) => origin.trim())
				.filter(Boolean)
		),
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_WINDOW: z.string().default('1 minute'),
	// Behind a reverse proxy, rate limiting needs the client IP from
	// X-Forwarded-For rather than the proxy's own address.
	TRUST_PROXY: z.stringbool().default(false)
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	return EnvSchema.parse(env);
}
