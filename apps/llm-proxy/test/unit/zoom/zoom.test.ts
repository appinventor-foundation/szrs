import { describe, expect, it } from 'vitest';

import {
	buildZoomMessages,
	buildZoomPrompt,
	parseZoomResponse,
	toSnakeSlug,
	ZOOM_SYSTEM_PROMPT
} from '../../../src/zoom/zoom.js';

const level = (type: string) => ({
	blocks: [
		{
			blockDef: { type },
			generatorCode: `forBlock["${type}"] = function(block, generator) { return ''; };`,
			toolboxEntry: { kind: 'block', type }
		}
	],
	workspaceJson: { blocks: { languageVersion: 0, blocks: [] } }
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
	it('parses plain JSON', () => {
		expect(parseZoomResponse(JSON.stringify(valid))).toEqual(valid);
	});

	it('strips markdown fences', () => {
		expect(parseZoomResponse('```json\n' + JSON.stringify(valid) + '\n```')).toEqual(valid);
	});

	it('strips leading prose', () => {
		expect(parseZoomResponse('Here you go: ' + JSON.stringify(valid))).toEqual(valid);
	});

	it('rejects invalid JSON', () => {
		expect(() => parseZoomResponse('{ not json')).toThrow(SyntaxError);
	});

	it('rejects a missing concept level', () => {
		expect(() => parseZoomResponse(JSON.stringify({ semantic: valid.semantic }))).toThrow(
			/concept/
		);
	});

	it('rejects blocks without generatorCode', () => {
		const bad = {
			...valid,
			semantic: { ...valid.semantic, blocks: [{ blockDef: { type: 'zoom_x_op' } }] }
		};
		expect(() => parseZoomResponse(JSON.stringify(bad))).toThrow(/generatorCode/);
	});
});
