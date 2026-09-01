import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get('/healthz', async () => ({ status: 'ok' }));

	fastify.get('/readyz', async (_request, reply) => {
		try {
			await fastify.db.execute(sql`select 1`);
			return { status: 'ok' };
		} catch (error) {
			fastify.log.error(error);
			return reply.code(503).send({ status: 'unavailable' });
		}
	});
}
