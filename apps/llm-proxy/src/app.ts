import sensible from '@fastify/sensible';
import fastify from 'fastify';

import { loadConfig } from './config.js';
import { loggerOptions } from './lib/logger.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import chatRoutes from './routes/chat.js';
import healthRoutes from './routes/health.js';

export function buildApp() {
	const config = loadConfig();

	const app = fastify({ logger: loggerOptions });

	// Decorated directly on the root instance (not inside a register()ed
	// plugin), so every plugin registered below — regardless of its own
	// encapsulation scope — can read fastify.config.
	app.decorate('config', config);

	void app.register(sensible);
	void app.register(errorHandlerPlugin);
	void app.register(authPlugin);

	void app.register(healthRoutes);
	void app.register(chatRoutes);

	return { app, config };
}
