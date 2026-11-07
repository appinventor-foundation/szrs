// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PROMPT_ID,
	getZoomPrompt,
	zoomPromptIds
} from '../../../src/zoom/prompts/index.js';
import { SHARED_ZOOM_PARAMS } from '../../../src/zoom/prompts/params.js';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('prompt registry', () => {
	it('resolves registered ids and the default', () => {
		for (const id of zoomPromptIds()) expect(getZoomPrompt(id).id).toBe(id);
		expect(getZoomPrompt().id).toBe(DEFAULT_PROMPT_ID);
	});

	it('registers the default id', () => {
		expect(zoomPromptIds()).toContain(DEFAULT_PROMPT_ID);
	});

	it('rejects an unknown id', () => {
		expect(() => getZoomPrompt('nope')).toThrow('Unknown zoom prompt id "nope"');
	});
});

// v0 is the original prompt, measured by the baseline. If one of these fails,
// someone edited it: put the change in a new prompt id instead.
describe('v0 is frozen', () => {
	const v0 = getZoomPrompt('v0');
	const probe = {
		slug: 'probe-slug',
		workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'a', id: 'b1' }] } }
	};

	it('has the original system text', () => {
		expect(sha256(v0.system)).toBe(
			'3bc17a0da123a5474042e13d51c9a6d2f2f4743cfbcfa238019cff40a312fbe0'
		);
	});

	it('has the original user message', () => {
		expect(sha256(v0.buildUser(probe))).toBe(
			'6154d0b9ea41678d2f7094e17317c1a4269189620f9140dee223547a7c107c05'
		);
	});

	it('has the original retry text', () => {
		expect(v0.buildUser(probe, 'concept: missing')).toContain(
			'\n\nYour previous attempt was invalid:\nconcept: missing\n\nReturn a complete, valid JSON object with "semantic" and "concept" keys only — no prose, no fences.'
		);
	});
});

// v1 became the default on 2026-11-06 and its results are what later prompts are
// measured against. If one of these fails, someone edited it: put the change in
// a new prompt id (v2) instead. Its sampling parameters are not pinned here: they
// are shared with v0 and can change without changing what the prompt says.
describe('v1 is frozen', () => {
	const v1 = getZoomPrompt('v1');
	const probe = {
		slug: 'probe-slug',
		workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'a', id: 'b1' }] } }
	};

	it('has the system text it was frozen with', () => {
		expect(sha256(v1.system)).toBe(
			'4073fdc238e1ddda0486566e8b98a51c5f70976cabeba62fb4101b45f697aaeb'
		);
	});

	it('builds the user message it was frozen with', () => {
		expect(sha256(v1.buildUser(probe))).toBe(
			'a6c7277661a7d5a1c88fdf008fa1bee0e16999fb330581c6d318b379dfa66289'
		);
	});

	it('builds the retry message it was frozen with', () => {
		expect(sha256(v1.buildUser(probe, 'concept: missing'))).toBe(
			'43a4068cf0ad3c388b11f4c0440aede784b99c6142cdcf6d5f28ce0c89ca1df4'
		);
	});
});

describe('v1', () => {
	const v0 = getZoomPrompt('v0');
	const v1 = getZoomPrompt('v1');
	const request = {
		slug: 'dice-app',
		workspaceJson: {
			blocks: {
				languageVersion: 0,
				blocks: [
					{ type: 'procedures_defnoreturn', id: 'b1', fields: { NAME: 'reset' } },
					{ type: 'text_print', id: 'b2' }
				]
			}
		}
	};

	it('is registered, and is the default', () => {
		expect(zoomPromptIds()).toEqual(['v0', 'v1', 'v2']);
		expect(DEFAULT_PROMPT_ID).toBe('v1');
	});

	it('keeps the block definition, binding and encoding rules word for word', () => {
		const rules = v0.system.slice(v0.system.indexOf('## Block definition rules'));

		expect(rules.length).toBeGreaterThan(500);
		expect(v1.system.endsWith(rules)).toBe(true);
	});

	it('asks for the plan, and for one concept per responsibility', () => {
		expect(v1.system).toContain('Use the keys "plan", "semantic" and "concept", in that order');
		expect(v1.system).toContain('## Step 1 — Plan');
		expect(v1.system).toContain('usually 2 to 7 concept blocks');
		expect(v1.system).toContain('zoom_<snake_slug>_<concept_name_in_snake_case>_concept');
		expect(v1.system).not.toContain('Usually ONE block');
	});

	it('says nothing about colour and does not place blocks', () => {
		expect(v1.system).not.toMatch(/colou?r/i);
		expect(v1.system).not.toContain('"x": 20');
		expect(v1.system).toContain('Do not set "x" or "y"');
	});

	it('does not imply an order between top-level stacks', () => {
		expect(v1.system).not.toMatch(/program order|reading order/i);
		expect(v1.system).toContain('Top-level stacks have no order');
		expect(v1.system).toContain('in the order of that stack' + "'" + 's own blocks');
	});

	it('builds a user message with the outline and compact JSON', () => {
		const message = v1.buildUser(request);

		expect(message).toContain('Slug: dice-app');
		expect(message).toContain('Snake slug (use this as prefix in block names): dice_app');
		expect(message).toContain('Program size: 2 blocks, 2 top-level stacks.');
		expect(message).toContain('- b1: procedures_defnoreturn, reset (1 block)');
		expect(message.endsWith(JSON.stringify(request.workspaceJson))).toBe(true);
		expect(message).not.toContain('\n  ');
		expect(message.indexOf('Program size')).toBeLessThan(message.indexOf('Detail workspace JSON'));
	});

	it('appends the retry text, naming the plan too', () => {
		const message = v1.buildUser(request, 'concept: missing');

		expect(message).toContain('Your previous attempt was invalid:\nconcept: missing');
		expect(message).toContain('"plan", "semantic" and "concept" keys only');
	});

	it('runs under the shared sampling parameters, like v0', () => {
		expect(v1.params).toEqual(SHARED_ZOOM_PARAMS);
		expect(v0.params).toEqual(SHARED_ZOOM_PARAMS);
	});
});

// v2 is not frozen yet (it has not been baselined), so no hashes are pinned.
// Freeze it, with the hashes, once it has produced results we rely on.
describe('v2', () => {
	const v1 = getZoomPrompt('v1');
	const v2 = getZoomPrompt('v2');

	it('is registered but is not the default', () => {
		expect(zoomPromptIds()).toContain('v2');
		expect(DEFAULT_PROMPT_ID).not.toBe('v2');
	});

	it('asks for placeholders, which the proxy expands; v0 and v1 ask for bindings', () => {
		expect(v2.output).toBe('placeholders');
		expect(getZoomPrompt('v0').output).toBeUndefined();
		expect(v1.output).toBeUndefined();
	});

	it('no longer asks the model for bindings or editable args', () => {
		expect(v2.system).not.toContain('"bindings":');
		expect(v2.system).not.toContain('## Binding rules');
		expect(v2.system).toContain('## Editable values');
		expect(v2.system).toContain('{b12.NUM}');
		expect(v2.system).toContain('Do not write field_number, field_input or field_dropdown');
	});

	it('says where a zoom block may sit inside a built-in block', () => {
		expect(v2.system).toContain('goes in a statement input');
		expect(v2.system).toContain('"output": null');
	});

	it('builds the same user message as v1, so the outline and canonical ids carry over', () => {
		const request = {
			slug: 'dice-app',
			workspaceJson: { blocks: { languageVersion: 0, blocks: [{ type: 'a', id: 'b1' }] } }
		};
		expect(v2.buildUser(request)).toBe(v1.buildUser(request));
		expect(v2.buildUser(request, 'e')).toBe(v1.buildUser(request, 'e'));
	});

	it('runs under the shared sampling parameters', () => {
		expect(v2.params).toEqual(SHARED_ZOOM_PARAMS);
	});
});
