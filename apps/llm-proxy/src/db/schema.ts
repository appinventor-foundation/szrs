import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const requestLogs = pgTable('request_logs', {
	id: uuid('id').primaryKey().defaultRandom(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	clientId: text('client_id').notNull(),
	provider: text('provider').notNull(),
	model: text('model').notNull(),
	promptTokens: integer('prompt_tokens').notNull(),
	completionTokens: integer('completion_tokens').notNull(),
	totalTokens: integer('total_tokens').notNull(),
	latencyMs: integer('latency_ms').notNull(),
	statusCode: integer('status_code').notNull(),
	errorMessage: text('error_message')
});
