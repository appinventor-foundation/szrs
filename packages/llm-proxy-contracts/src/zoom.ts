import { z } from 'zod';

export const ZoomRequestSchema = z.object({
	model: z.string(),
	slug: z.string().min(1),
	workspaceJson: z.record(z.string(), z.unknown())
});
export type ZoomRequest = z.infer<typeof ZoomRequestSchema>;

/** Field kinds a zoom block may use. Everything else is rejected, see DECISIONS.md #10. */
export const ZOOM_FIELD_TYPES = [
	'field_number',
	'field_input',
	'field_dropdown',
	'field_label'
] as const;
/** The field kinds a binding can make editable. */
export const ZOOM_EDITABLE_FIELD_TYPES = ['field_number', 'field_input', 'field_dropdown'] as const;
const ZOOM_INPUT_TYPES = [
	'input_value',
	'input_statement',
	'input_dummy',
	'input_end_row'
] as const;
const ARG_TYPES = [...ZOOM_INPUT_TYPES, ...ZOOM_FIELD_TYPES];

// Block definition keys that run registered JavaScript or load URLs.
const FORBIDDEN_BLOCK_KEYS = ['extensions', 'mutator', 'helpUrl'] as const;

export const ZoomArgSchema = z
	.looseObject({
		type: z.enum(ARG_TYPES, { error: `arg type must be one of: ${ARG_TYPES.join(', ')}` }),
		name: z.string().optional(),
		options: z
			.array(z.tuple([z.string(), z.string()]))
			.min(1)
			.optional()
	})
	.refine((arg) => arg.type !== 'field_dropdown' || arg.options !== undefined, {
		message: 'field_dropdown needs "options": [["label", "VALUE"], ...]'
	});
export type ZoomArg = z.infer<typeof ZoomArgSchema>;

export const ZoomBlockDefSchema = z
	.looseObject({
		type: z
			.string()
			.regex(/^zoom_[a-z0-9_]+$/, 'block types must start with zoom_ and use only a-z, 0-9 and _')
	})
	.superRefine((def, ctx) => {
		for (const key of FORBIDDEN_BLOCK_KEYS) {
			if (key in def)
				ctx.addIssue({ code: 'custom', path: [key], message: `${key} is not allowed` });
		}
		for (const [key, value] of Object.entries(def)) {
			if (!/^args\d+$/.test(key)) continue;
			const args = z.array(ZoomArgSchema).safeParse(value);
			for (const issue of args.error?.issues ?? []) {
				ctx.addIssue({ code: 'custom', path: [key, ...issue.path], message: issue.message });
			}
		}

		// Blockly rejects a definition whose message doesn't use each of its
		// args exactly once, as %1 … %N.
		const indices = new Set(
			Object.keys(def).flatMap((key) => /^(?:message|args)(\d+)$/.exec(key)?.[1] ?? [])
		);
		for (const n of indices) {
			const args = def[`args${n}`];
			const count = Array.isArray(args) ? args.length : 0;
			const message = def[`message${n}`];
			const refs =
				typeof message === 'string'
					? [...message.matchAll(/%(\d+)/g)].map((m) => Number(m[1]))
					: [];
			const expected = Array.from({ length: count }, (_, i) => i + 1);
			const sorted = [...refs].sort((a, b) => a - b);
			if (refs.length !== count || sorted.some((ref, i) => ref !== expected[i])) {
				ctx.addIssue({
					code: 'custom',
					path: [`message${n}`],
					message: `message${n} must use each of its ${count} args exactly once, as ${expected.map((i) => `%${i}`).join(' ') || 'no %N placeholders'}; it uses ${refs.map((r) => `%${r}`).join(' ') || 'none'}`
				});
			}
		}
	});
export type ZoomBlockDef = z.infer<typeof ZoomBlockDefSchema>;

export const ZoomFieldRefSchema = z.object({ block: z.string(), field: z.string() });
export type ZoomFieldRef = z.infer<typeof ZoomFieldRefSchema>;

/** Links a field on a zoomed block to the Detail field(s) it edits (DECISIONS.md #8). */
export const ZoomBindingSchema = z.object({
	block: z.string(),
	field: z.string(),
	detail: z.array(ZoomFieldRefSchema).min(1)
});
export type ZoomBinding = z.infer<typeof ZoomBindingSchema>;

export const ZoomLevelSchema = z.object({
	blockDefs: z.array(ZoomBlockDefSchema).min(1),
	workspaceJson: z.looseObject({}),
	bindings: z.array(ZoomBindingSchema).default([])
});
export type ZoomLevel = z.infer<typeof ZoomLevelSchema>;

/** One feature or responsibility in the model's plan. */
export const ZoomPlanConceptSchema = z.object({
	/** Also the id of this concept's block in the Concept level. */
	id: z.string().optional(),
	name: z.string().optional(),
	/** Ids of the top-level Detail blocks the concept covers; the first is its anchor. */
	stacks: z.array(z.string()),
	/** Ids of the blocks in the Semantic level that describe it. */
	operations: z.array(z.string())
});
export type ZoomPlanConcept = z.infer<typeof ZoomPlanConceptSchema>;

/**
 * What the model planned the levels from. The plugin uses it to look up, for a
 * zoom block, the Detail block it stands for (its anchor) and to show the zoom
 * block with that block's colour: the first of `stacks` for a concept block,
 * the first of `covers[id]` for a Semantic one. Every part is a hint: a plan
 * may be missing, or name blocks that do not exist, and a zoom is still valid.
 */
export const ZoomPlanSchema = z.object({
	purpose: z.string().optional(),
	concepts: z.array(ZoomPlanConceptSchema),
	/** Semantic block id -> ids of the Detail blocks it stands for (any depth), anchor first. */
	covers: z.record(z.string(), z.array(z.string())).optional()
});
export type ZoomPlan = z.infer<typeof ZoomPlanSchema>;

export const ZoomResponseSchema = z.object({
	semantic: ZoomLevelSchema,
	concept: ZoomLevelSchema,
	/** Optional: absent for prompts that ask for no plan, and for results stored before it was returned. */
	plan: ZoomPlanSchema.optional()
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
	z.object({
		type: z.literal('done'),
		result: ZoomResponseSchema,
		/** Set when the proxy had this zoom stored, so no model was called. */
		cached: z.boolean().optional()
	}),
	z.object({
		type: z.literal('error'),
		code: z.enum(['upstream_error', 'invalid_model_output', 'internal_error']),
		message: z.string(),
		status: z.number().int().optional()
	})
]);
export type ZoomStreamEvent = z.infer<typeof ZoomStreamEventSchema>;
