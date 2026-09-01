import { z } from 'zod';

const EnvSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3000),
	DATABASE_URL: z.string(),
	INTERNAL_API_KEY: z.string(),
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
	DEPLOYMENT_ENVIRONMENT: z.string().default('development'),
	OPENAI_API_KEY: z.string().optional(),
	OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
	OPENAI_DEFAULT_MODEL: z.string().default('gpt-4o-mini'),
	SELF_HOSTED_BASE_URL: z.string().optional(),
	SELF_HOSTED_MODEL: z.string().optional()
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	return EnvSchema.parse(env);
}
