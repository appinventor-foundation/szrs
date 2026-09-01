import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
	fastify.setErrorHandler((error: FastifyError, request, reply) => {
		request.log.error(error);

		if (error instanceof ZodError) {
			reply
				.code(400)
				.send({ error: { message: 'Invalid request', code: 'invalid_request' } });
			return;
		}

		const statusCode = error.statusCode ?? 500;
		reply.code(statusCode).send({
			error: { message: error.message, code: 'internal_error' }
		});
	});
}

// fp() breaks this plugin out of Fastify's default encapsulation so
// setErrorHandler applies app-wide, not just within this plugin's own scope.
export default fp(errorHandlerPlugin, { name: 'error-handler' });
