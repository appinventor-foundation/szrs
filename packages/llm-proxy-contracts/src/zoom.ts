import { z } from 'zod';

export const ZoomRequestSchema = z.object({
	model: z.string(),
	slug: z.string().min(1),
	workspaceJson: z.record(z.string(), z.unknown())
});
export type ZoomRequest = z.infer<typeof ZoomRequestSchema>;

export const ZoomBlockSchema = z.object({
	blockDef: z.looseObject({ type: z.string() }),
	generatorCode: z.string(),
	toolboxEntry: z.looseObject({ kind: z.string(), type: z.string() })
});
export type ZoomBlock = z.infer<typeof ZoomBlockSchema>;

export const ZoomLevelSchema = z.object({
	blocks: z.array(ZoomBlockSchema).min(1),
	workspaceJson: z.looseObject({})
});
export type ZoomLevel = z.infer<typeof ZoomLevelSchema>;

export const ZoomResponseSchema = z.object({
	semantic: ZoomLevelSchema,
	concept: ZoomLevelSchema
});
export type ZoomResponse = z.infer<typeof ZoomResponseSchema>;

export const ZoomStreamEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('attempt'),
		attempt: z.number().int().positive(),
		maxAttempts: z.number().int().positive(),
		previousError: z.string().optional()
	}),
	z.object({ type: z.literal('token'), text: z.string() }),
	z.object({ type: z.literal('done'), result: ZoomResponseSchema }),
	z.object({
		type: z.literal('error'),
		code: z.enum(['upstream_error', 'invalid_model_output', 'internal_error']),
		message: z.string(),
		status: z.number().int().optional()
	})
]);
export type ZoomStreamEvent = z.infer<typeof ZoomStreamEventSchema>;
