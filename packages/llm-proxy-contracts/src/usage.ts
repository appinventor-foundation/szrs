import { z } from 'zod';

export const UsageQuerySchema = z.object({
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
	clientId: z.string().optional(),
	model: z.string().optional()
});
export type UsageQuery = z.infer<typeof UsageQuerySchema>;

export const UsageLogEntrySchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	clientId: z.string(),
	provider: z.string(),
	model: z.string(),
	promptTokens: z.number().int().nonnegative(),
	completionTokens: z.number().int().nonnegative(),
	totalTokens: z.number().int().nonnegative(),
	latencyMs: z.number().int().nonnegative(),
	statusCode: z.number().int(),
	errorMessage: z.string().nullable()
});
export type UsageLogEntry = z.infer<typeof UsageLogEntrySchema>;

export const UsageSummarySchema = z.object({
	requestCount: z.number().int().nonnegative(),
	totalPromptTokens: z.number().int().nonnegative(),
	totalCompletionTokens: z.number().int().nonnegative(),
	totalTokens: z.number().int().nonnegative(),
	averageLatencyMs: z.number().nonnegative(),
	errorCount: z.number().int().nonnegative()
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
