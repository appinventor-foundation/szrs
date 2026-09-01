import sensible from '@fastify/sensible';
import fastify from 'fastify';

import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { loggerOptions } from './lib/logger.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import { ProviderRegistry } from './providers/registry.js';
import chatRoutes from './routes/chat.js';
import healthRoutes from './routes/health.js';
import usageRoutes from './routes/usage.js';

export function buildApp() {
	const config = loadConfig();
	const { db, client: dbClient } = createDb(config.DATABASE_URL);
	const registry = new ProviderRegistry(config);

	const app = fastify({ logger: loggerOptions });

	// Decorated directly on the root instance (not inside a register()ed
	// plugin), so every plugin registered below — regardless of its own
	// encapsulation scope — can read fastify.config/db/registry.
	app.decorate('config', config);
	app.decorate('db', db);
	app.decorate('registry', registry);
	app.addHook('onClose', async () => {
		await dbClient.end();
	});

	void app.register(sensible);
	void app.register(errorHandlerPlugin);
	void app.register(authPlugin);

	void app.register(healthRoutes);
	void app.register(chatRoutes);
	void app.register(usageRoutes);

	return { app, config };
}
