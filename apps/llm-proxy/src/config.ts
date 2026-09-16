import { z } from 'zod';

const EnvSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3000),
	INTERNAL_API_KEY: z.string(),
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
	DEPLOYMENT_ENVIRONMENT: z.string().default('development'),
	LITELLM_BASE_URL: z.string().default('http://localhost:4000'),
	LITELLM_VIRTUAL_KEY: z.string()
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	return EnvSchema.parse(env);
}
