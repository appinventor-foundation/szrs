import { z } from 'zod';

export const ChatMessageSchema = z.object({
	role: z.enum(['system', 'user', 'assistant']),
	content: z.string()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompletionRequestSchema = z.object({
	model: z.string(),
	messages: z.array(ChatMessageSchema).min(1),
	temperature: z.number().min(0).max(2).optional(),
	maxTokens: z.number().int().positive().optional()
});
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export const ChatCompletionUsageSchema = z.object({
	promptTokens: z.number().int().nonnegative(),
	completionTokens: z.number().int().nonnegative(),
	totalTokens: z.number().int().nonnegative()
});
export type ChatCompletionUsage = z.infer<typeof ChatCompletionUsageSchema>;

export const ChatCompletionResponseSchema = z.object({
	content: z.string(),
	model: z.string(),
	usage: ChatCompletionUsageSchema,
	finishReason: z.string()
});
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
