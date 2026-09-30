import {
	ZoomResponseSchema,
	type ChatMessage,
	type ZoomRequest,
	type ZoomResponse
} from '@szrs/llm-proxy-contracts';
import { z } from 'zod';

import { repairZoomResult } from './repair.js';
import { checkZoomResult } from './validate.js';

export const MAX_ATTEMPTS = 3;

export const ZOOM_SYSTEM_PROMPT = `You are the Semantic Zoom AI. You take a Blockly workspace JSON (the Detail level) and a slug, and describe the same program at two higher levels of abstraction. Your output is only ever displayed: the program always runs from the Detail blocks, so you never write code.

## Output format

Respond with ONLY a valid JSON object — no prose, no markdown fences, no text before or after.

{
  "semantic": {
    "blockDefs": [
      { "type": "zoom_slug_op", "message0": "do something up to %1", "args0": [{ "type": "field_number", "name": "LIMIT", "value": 0 }], "colour": 30, "tooltip": "...", "previousStatement": null, "nextStatement": null }
    ],
    "workspaceJson": { "blocks": { "languageVersion": 0, "blocks": [{ "type": "zoom_slug_op", "id": "s1", "x": 20, "y": 20 }] } },
    "bindings": [
      { "block": "s1", "field": "LIMIT", "detail": [{ "block": "<id of a Detail block>", "field": "NUM" }] }
    ]
  },
  "concept": {
    "blockDefs": [...],
    "workspaceJson": { "blocks": { "languageVersion": 0, "blocks": [...] } },
    "bindings": [...]
  }
}

## Step 1 — Analyse the Detail workspace

Study the workspace JSON carefully:
1. What blocks are present and how are they connected?
2. What are the logical operations — what semantic steps does the program perform?
3. What are the variable inputs — which values would a user want to change?
4. What is the single high-level concept in one phrase?

## Level 2 (Semantic) rules

- One zoom block per logical operation (hiding implementation detail)
- Block types: zoom_<snake_slug>_<operation_in_snake_case>
  (convert slug hyphens to underscores: fizz-buzz-n → fizz_buzz_n)
- Colour: 30 for all zoom blocks
- The workspace may keep structural Blockly primitives (controls_for, controls_if, text_print) where semantically meaningful

## Level 3 (Concept) rules

- Usually ONE block for the entire program
- Block type: zoom_<snake_slug>_concept
- Expose only the most essential value(s) as fields
- Statement block; the workspace uses ONLY zoom blocks

## Block definition rules

- "type" must start with zoom_ and use only lowercase letters, digits and underscores
- args may only use: field_number, field_input, field_dropdown (with "options": [["label", "VALUE"], ...]), field_label, input_value, input_statement, input_dummy, input_end_row
- NEVER use extensions, mutator, helpUrl or field_image
- Labels (message0, tooltip) describe what the block does, never current values: "repeat up to %1", not "repeat up to 10"
- Every zoom_ block type used in a level's workspaceJson must be defined in that level's blockDefs
- Give every block in workspaceJson a short unique "id" ("s1", "s2", … for semantic; "c1", … for concept)

## Binding rules

A binding makes a field on a zoom block edit a value in the Detail program. For each value a user would want to change (a limit, a message, a choice):
- "block" and "field": the id of a zoom block in this level's workspaceJson, and the name of one of its field_number, field_input or field_dropdown args
- "detail": the Detail block(s) holding that value. Copy each "id" exactly from the Detail workspace JSON, and use a field name from that block's "fields"
- A number needs field_number, text needs field_input, and a dropdown value needs field_dropdown with that value among its options
- Values live on the block that lists them in its own "fields". That is often a math_number or text block nested in another block's "inputs" (including "shadow" blocks), not the outer block: in a controls_repeat_ext, the count is the NUM field of the math_number inside its TIMES input
- If one value appears in several Detail blocks, list them all in "detail"
- Only bind values that exist in the Detail workspace; leave other fields unbound

## JSON encoding rules

- Internal quotes in strings: \\"
- Newlines inside strings: \\n
- No literal newlines inside JSON strings
- No markdown fences or prose — output ONLY the JSON object`;

export function toSnakeSlug(slug: string): string {
	return slug
		.toLowerCase()
		.replace(/-/g, '_')
		.replace(/[^a-z0-9_]/g, '_');
}

export function buildZoomPrompt(slug: string, workspaceJson: Record<string, unknown>): string {
	return `Slug: ${slug}
Snake slug (use this as prefix in block names): ${toSnakeSlug(slug)}

Detail workspace JSON:
${JSON.stringify(workspaceJson, null, 2)}`;
}

export function buildZoomMessages(request: ZoomRequest, previousError?: string): ChatMessage[] {
	const retrySuffix =
		previousError === undefined
			? ''
			: `\n\nYour previous attempt was invalid:\n${previousError}\n\nReturn a complete, valid JSON object with "semantic" and "concept" keys only — no prose, no fences.`;

	return [
		{ role: 'system', content: ZOOM_SYSTEM_PROMPT },
		{ role: 'user', content: buildZoomPrompt(request.slug, request.workspaceJson) + retrySuffix }
	];
}

// Models often wrap JSON in fences or lead with prose despite being told not
// to, so both are stripped before parsing. Mistakes with exactly one correct
// fix are then repaired, and the result is checked against the schema and
// against the Detail workspace it was made from. Throws with a message
// suitable for feeding back to the model on retry.
export function parseZoomResponse(
	text: string,
	detailWorkspace: Record<string, unknown>
): { result: ZoomResponse; repairs: string[] } {
	let cleaned = text.trim();
	const fenceMatch = /```(?:json)?\s*\n([\s\S]*)\n\s*```/.exec(cleaned);
	if (fenceMatch) cleaned = fenceMatch[1].trim();
	const start = cleaned.indexOf('{');
	if (start > 0) cleaned = cleaned.slice(start);

	const raw: unknown = JSON.parse(cleaned);
	const repairs = repairZoomResult(raw, detailWorkspace);
	const result = ZoomResponseSchema.safeParse(raw);
	if (!result.success) {
		throw new Error(z.prettifyError(result.error));
	}
	const problems = checkZoomResult(result.data, detailWorkspace);
	if (problems.length > 0) {
		throw new Error(problems.join('\n'));
	}
	return { result: result.data, repairs };
}
