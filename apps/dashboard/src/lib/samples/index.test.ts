// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';
import { workspaceSchema } from '#lib/schemas/workspace.js';
import { describeStarter, isSampleId, SAMPLE_IDS, samples } from './index.js';

describe('samples', () => {
	it('has an entry for every id, filed under its own id', () => {
		expect(Object.keys(samples).sort()).toEqual([...SAMPLE_IDS].sort());
		for (const id of SAMPLE_IDS) expect(samples[id].id).toBe(id);
	});

	it('only treats known ids as samples', () => {
		expect(isSampleId('counting-loop')).toBe(true);
		expect(isSampleId('nope')).toBe(false);
		expect(isSampleId(null)).toBe(false);
	});

	it.each(SAMPLE_IDS)('%s is a workspace Blockly can load', (id) => {
		expect(workspaceSchema.safeParse(samples[id].workspace).success).toBe(true);

		const workspace = new Blockly.Workspace();
		Blockly.serialization.workspaces.load(samples[id].workspace, workspace);

		expect(workspace.getTopBlocks().length).toBeGreaterThan(0);
		workspace.dispose();
	});

	it('describes a demo’s starting program', () => {
		expect(describeStarter({ starterKind: 'empty', sampleId: null })).toBe('Empty workspace');
		expect(describeStarter({ starterKind: 'custom', sampleId: null })).toBe('A saved program');
		expect(describeStarter({ starterKind: 'sample', sampleId: 'counting-loop' })).toBe(
			'Example: Counting loop'
		);
		expect(describeStarter({ starterKind: 'sample', sampleId: 'removed-sample' })).toBe(
			'Empty workspace'
		);
	});
});
