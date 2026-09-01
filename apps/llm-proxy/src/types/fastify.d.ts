import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import type { ProviderRegistry } from '../providers/registry.js';

declare module 'fastify' {
	interface FastifyInstance {
		config: Config;
		db: Db;
		registry: ProviderRegistry;
	}
}
