// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Tests for registering and loading zoomed levels.
 */

const assert = require('assert');
const Blockly = require('blockly/core');
const { ZoomLevelLoader } = require('../src/zoom_level_loader');

const workspaceJson = (...blocks) => ({ blocks: { languageVersion: 0, blocks } });

/** A level with one zoom block whose TIMES field is bound to Detail block "times". */
function level(type) {
	return {
		blockDefs: [
			{ type, message0: 'greet %1 times', args0: [{ type: 'field_number', name: 'TIMES' }] }
		],
		workspaceJson: workspaceJson({ type, id: 'c1', fields: { TIMES: 0 } }),
		bindings: [{ block: 'c1', field: 'TIMES', detail: [{ block: 'times', field: 'NUM' }] }]
	};
}

suite('ZoomLevelLoader', function () {
	let detail;
	let target;
	let loader;

	suiteSetup(function () {
		// Stands in for Detail's math_number, which blockly/core doesn't define.
		Blockly.common.defineBlocksWithJsonArray([
			{ type: 'test_number', message0: '%1', args0: [{ type: 'field_number', name: 'NUM' }] }
		]);
	});

	suiteTeardown(function () {
		delete Blockly.Blocks['test_number'];
	});

	setup(function () {
		detail = new Blockly.Workspace();
		Blockly.serialization.workspaces.load(
			workspaceJson({ type: 'test_number', id: 'times', fields: { NUM: 7 } }),
			detail
		);
		target = new Blockly.Workspace();
		loader = new ZoomLevelLoader();
	});

	teardown(function () {
		target.dispose();
		detail.dispose();
		loader.unregister();
	});

	test('loads the level and shows bound fields with their Detail values', function () {
		loader.load(level('zoom_greet_concept'), target, detail);

		const block = target.getBlockById('c1');
		assert.strictEqual(block.type, 'zoom_greet_concept');
		assert.strictEqual(block.getFieldValue('TIMES'), 7);
	});

	test('locks the level: blocks stay put and only bound fields are enabled', function () {
		const locked = level('zoom_greet_concept');
		locked.blockDefs[0].message0 = 'greet %1 times %2';
		locked.blockDefs[0].args0.push({ type: 'field_input', name: 'NOTE' });
		loader.load(locked, target, detail);

		const block = target.getBlockById('c1');
		assert.strictEqual(block.isMovable(), false);
		assert.strictEqual(block.isDeletable(), false);
		assert.strictEqual(block.getField('TIMES').isEnabled(), true);
		assert.strictEqual(block.getField('NOTE').isEnabled(), false);
	});

	test('removes the previous level’s block types when loading another', function () {
		loader.load(level('zoom_greet_semantic'), target, detail);
		loader.load(level('zoom_greet_concept'), target, detail);

		assert.strictEqual(Blockly.Blocks['zoom_greet_semantic'], undefined);
		assert.ok(Blockly.Blocks['zoom_greet_concept']);
		assert.deepStrictEqual(
			target.getAllBlocks(false).map((block) => block.type),
			['zoom_greet_concept']
		);
	});

	test('unregister() removes the block types it registered', function () {
		loader.load(level('zoom_greet_concept'), target, detail);
		target.clear();
		loader.unregister();

		assert.strictEqual(Blockly.Blocks['zoom_greet_concept'], undefined);
	});

	test('refuses block types without the zoom_ prefix and registers nothing', function () {
		const bad = level('zoom_greet_concept');
		bad.blockDefs.push({ type: 'text_print', message0: 'hijacked' });

		assert.throws(() => loader.load(bad, target, detail), /non-zoom block type "text_print"/);
		assert.strictEqual(Blockly.Blocks['zoom_greet_concept'], undefined);
		assert.strictEqual(Blockly.Blocks['text_print'], undefined);
	});

	test('throws when the level uses an undefined block type, and still cleans up', function () {
		const bad = level('zoom_greet_concept');
		bad.workspaceJson = workspaceJson({ type: 'zoom_greet_missing', id: 'x' });

		assert.throws(() => loader.load(bad, target, detail));
		target.clear();
		loader.unregister();
		assert.strictEqual(Blockly.Blocks['zoom_greet_concept'], undefined);
	});
});
