import { UsageQuerySchema } from '@szrs/llm-proxy-contracts';
import { and, avg, count, eq, gte, lte, sum } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requestLogs } from '../db/schema.js';

function buildFilters(query: ReturnType<typeof UsageQuerySchema.parse>) {
	const filters = [];
	if (query.from) filters.push(gte(requestLogs.createdAt, new Date(query.from)));
	if (query.to) filters.push(lte(requestLogs.createdAt, new Date(query.to)));
	if (query.clientId) filters.push(eq(requestLogs.clientId, query.clientId));
	if (query.model) filters.push(eq(requestLogs.model, query.model));
	return filters.length > 0 ? and(...filters) : undefined;
}

export default async function usageRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get('/v1/usage', async (request) => {
		const query = UsageQuerySchema.parse(request.query);
		const where = buildFilters(query);

		const rows = await fastify.db.select().from(requestLogs).where(where).limit(200);
		return rows.map((row) => ({
			id: row.id,
			createdAt: row.createdAt.toISOString(),
			clientId: row.clientId,
			provider: row.provider,
			model: row.model,
			promptTokens: row.promptTokens,
			completionTokens: row.completionTokens,
			totalTokens: row.totalTokens,
			latencyMs: row.latencyMs,
			statusCode: row.statusCode,
			errorMessage: row.errorMessage
		}));
	});

	fastify.get('/v1/usage/summary', async (request) => {
		const query = UsageQuerySchema.parse(request.query);
		const where = buildFilters(query);

		const [summary] = await fastify.db
			.select({
				requestCount: count(),
				totalPromptTokens: sum(requestLogs.promptTokens),
				totalCompletionTokens: sum(requestLogs.completionTokens),
				totalTokens: sum(requestLogs.totalTokens),
				averageLatencyMs: avg(requestLogs.latencyMs)
			})
			.from(requestLogs)
			.where(where);

		const [errorSummary] = await fastify.db
			.select({ errorCount: count() })
			.from(requestLogs)
			.where(where ? and(where, eq(requestLogs.statusCode, 502)) : eq(requestLogs.statusCode, 502));

		return {
			requestCount: summary.requestCount,
			totalPromptTokens: Number(summary.totalPromptTokens ?? 0),
			totalCompletionTokens: Number(summary.totalCompletionTokens ?? 0),
			totalTokens: Number(summary.totalTokens ?? 0),
			averageLatencyMs: Number(summary.averageLatencyMs ?? 0),
			errorCount: errorSummary.errorCount
		};
	});
}
