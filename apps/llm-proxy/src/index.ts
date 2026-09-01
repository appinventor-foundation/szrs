import './otel.js';

import { buildApp } from './app.js';

const { app, config } = buildApp();

app
	.listen({ port: config.PORT, host: '0.0.0.0' })
	.catch((error: unknown) => {
		app.log.error(error);
		process.exit(1);
	});
