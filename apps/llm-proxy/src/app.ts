import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import fastify from 'fastify';

import { loadConfig } from './config.js';
import { loggerOptions } from './lib/logger.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import chatRoutes from './routes/chat.js';
import healthRoutes from './routes/health.js';
import zoomRoutes from './routes/zoom.js';

export function buildApp(env: NodeJS.ProcessEnv = process.env) {
	const config = loadConfig(env);

	const app = fastify({ logger: loggerOptions, trustProxy: config.TRUST_PROXY });

	// Decorated directly on the root instance (not inside a register()ed
	// plugin), so every plugin registered below — regardless of its own
	// encapsulation scope — can read fastify.config.
	app.decorate('config', config);

	void app.register(sensible);
	void app.register(errorHandlerPlugin);
	// Hook order matters: CORS answers preflights (which never carry the API
	// key) before auth sees them, and rate limiting counts rejected requests too.
	void app.register(cors, { origin: config.CORS_ORIGINS });
	void app.register(rateLimit, {
		max: config.RATE_LIMIT_MAX,
		timeWindow: config.RATE_LIMIT_WINDOW
	});
	void app.register(authPlugin);

	void app.register(healthRoutes);
	void app.register(chatRoutes);
	void app.register(zoomRoutes);

	return { app, config };
}
