import { describe, expect, it } from 'vitest';

import {
	buildZoomMessages,
	buildZoomPrompt,
	parseZoomResponse,
	toSnakeSlug,
	ZOOM_SYSTEM_PROMPT
} from '../../../src/zoom/zoom.js';

const level = (type: string) => ({
	blockDefs: [{ type, message0: 'do it' }],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [] } },
	bindings: []
});

const valid = { semantic: level('zoom_x_op'), concept: level('zoom_x_concept') };

describe('toSnakeSlug', () => {
	it('converts hyphens and strips other characters', () => {
		expect(toSnakeSlug('Fizz-Buzz n!')).toBe('fizz_buzz_n_');
	});
});

describe('buildZoomPrompt', () => {
	it('includes the slug, snake slug and workspace JSON', () => {
		const prompt = buildZoomPrompt('fizz-buzz-n', { blocks: {} });
		expect(prompt).toContain('Slug: fizz-buzz-n');
		expect(prompt).toContain('fizz_buzz_n');
		expect(prompt).toContain('"blocks": {}');
	});
});

describe('buildZoomMessages', () => {
	const request = { model: 'local-ollama', slug: 'x', workspaceJson: {} };

	it('sends the system prompt and the zoom prompt', () => {
		const [system, user] = buildZoomMessages(request);
		expect(system).toEqual({ role: 'system', content: ZOOM_SYSTEM_PROMPT });
		expect(user.content).toBe(buildZoomPrompt('x', {}));
	});

	it('appends the previous error on retry', () => {
		const [, user] = buildZoomMessages(request, 'concept: missing');
		expect(user.content).toContain('Your previous attempt was invalid:\nconcept: missing');
	});
});

describe('parseZoomResponse', () => {
	const detail = {};
	const withSemantic = (semantic: Record<string, unknown>) =>
		JSON.stringify({ ...valid, semantic: { ...valid.semantic, ...semantic } });
	const withDef = (def: Record<string, unknown>) =>
		withSemantic({ blockDefs: [{ type: 'zoom_x_op', ...def }] });

	it('parses plain JSON', () => {
		expect(parseZoomResponse(JSON.stringify(valid), detail)).toEqual(valid);
	});

	it('strips markdown fences', () => {
		expect(parseZoomResponse('```json\n' + JSON.stringify(valid) + '\n```', detail)).toEqual(valid);
	});

	it('strips leading prose', () => {
		expect(parseZoomResponse('Here you go: ' + JSON.stringify(valid), detail)).toEqual(valid);
	});

	it('defaults bindings to an empty list', () => {
		const semantic = {
			blockDefs: valid.semantic.blockDefs,
			workspaceJson: valid.semantic.workspaceJson
		};
		const parsed = parseZoomResponse(JSON.stringify({ ...valid, semantic }), detail);
		expect(parsed.semantic.bindings).toEqual([]);
	});

	it('rejects invalid JSON', () => {
		expect(() => parseZoomResponse('{ not json', detail)).toThrow(SyntaxError);
	});

	it('rejects a missing concept level', () => {
		expect(() => parseZoomResponse(JSON.stringify({ semantic: valid.semantic }), detail)).toThrow(
			/concept/
		);
	});

	it('rejects block types without the zoom_ prefix', () => {
		expect(() =>
			parseZoomResponse(withSemantic({ blockDefs: [{ type: 'controls_if' }] }), detail)
		).toThrow(/must start with zoom_/);
	});

	it.each(['extensions', 'mutator', 'helpUrl'])('rejects block definitions using %s', (key) => {
		expect(() => parseZoomResponse(withDef({ [key]: 'x' }), detail)).toThrow(
			`${key} is not allowed`
		);
	});

	it('rejects field_image args', () => {
		expect(() =>
			parseZoomResponse(withDef({ args0: [{ type: 'field_image', src: 'https://x' }] }), detail)
		).toThrow(/arg type must be one of/);
	});

	it('rejects a dropdown without options', () => {
		expect(() =>
			parseZoomResponse(withDef({ args0: [{ type: 'field_dropdown', name: 'D' }] }), detail)
		).toThrow(/field_dropdown needs "options"/);
	});

	it('rejects results that fail the checks against the Detail workspace', () => {
		const bindings = [{ block: 's1', field: 'N', detail: [{ block: 'd1', field: 'NUM' }] }];
		expect(() => parseZoomResponse(withSemantic({ bindings }), detail)).toThrow(
			/has no block with id "s1"/
		);
	});
});
