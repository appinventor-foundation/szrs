// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Tests for editing bound fields in a zoomed view.
 */

const assert = require('assert');
const Blockly = require('blockly/core');
const { ZoomLevelLoader } = require('../src/zoom_level_loader');
const { ZoomViewEditor } = require('../src/zoom_view_editor');

const workspaceJson = (...blocks) => ({ blocks: { languageVersion: 0, blocks } });

/** Blockly fires change events asynchronously. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A level with one zoom block: TIMES is bound to both Detail counts, COPY is
 * bound to the first count too, LIMIT to a Detail number that can't go below
 * 0, and NOTE isn't bound.
 */
const level = {
	blockDefs: [
		{
			type: 'zoom_edit_concept',
			message0: 'greet %1 %2 %3 %4',
			args0: [
				{ type: 'field_number', name: 'TIMES' },
				{ type: 'field_number', name: 'COPY' },
				{ type: 'field_number', name: 'LIMIT' },
				{ type: 'field_input', name: 'NOTE' }
			]
		}
	],
	workspaceJson: workspaceJson({ type: 'zoom_edit_concept', id: 'c1' }),
	bindings: [
		{
			block: 'c1',
			field: 'TIMES',
			detail: [
				{ block: 'count1', field: 'NUM' },
				{ block: 'count2', field: 'NUM' }
			]
		},
		{ block: 'c1', field: 'COPY', detail: [{ block: 'count1', field: 'NUM' }] },
		{ block: 'c1', field: 'LIMIT', detail: [{ block: 'limit', field: 'NUM' }] }
	]
};

suite('ZoomViewEditor', function () {
	let detail;
	let view;
	let loader;
	let editor;
	let edits;

	suiteSetup(function () {
		Blockly.common.defineBlocksWithJsonArray([
			{ type: 'test_number', message0: '%1', args0: [{ type: 'field_number', name: 'NUM' }] },
			{
				type: 'test_positive',
				message0: '%1',
				args0: [{ type: 'field_number', name: 'NUM', min: 0 }]
			}
		]);
	});

	suiteTeardown(function () {
		delete Blockly.Blocks['test_number'];
		delete Blockly.Blocks['test_positive'];
	});

	setup(async function () {
		detail = new Blockly.Workspace();
		Blockly.serialization.workspaces.load(
			workspaceJson(
				{ type: 'test_number', id: 'count1', fields: { NUM: 5 } },
				{ type: 'test_number', id: 'count2', fields: { NUM: 5 } },
				{ type: 'test_positive', id: 'limit', fields: { NUM: 3 } }
			),
			detail
		);
		view = new Blockly.Workspace();
		loader = new ZoomLevelLoader();
		loader.load(level, view, detail);
		edits = 0;
		editor = new ZoomViewEditor(view, detail, () => edits++);
		editor.setBindings(level.bindings);
		await settle();
	});

	teardown(function () {
		editor.dispose();
		view.dispose();
		detail.dispose();
		loader.unregister();
	});

	const field = (name) => view.getBlockById('c1').getField(name);
	const detailValue = (id) => detail.getBlockById(id).getFieldValue('NUM');

	test('writes an edit to every Detail field it is bound to', async function () {
		field('TIMES').setValue(8);
		await settle();

		assert.strictEqual(detailValue('count1'), 8);
		assert.strictEqual(detailValue('count2'), 8);
		assert.strictEqual(edits, 1);
	});

	test('refreshes other zoomed fields bound to the same value', async function () {
		field('TIMES').setValue(8);
		await settle();

		assert.strictEqual(field('COPY').getValue(), 8);
	});

	test('shows the value Detail accepted when Detail adjusts it', async function () {
		field('LIMIT').setValue(-5);
		await settle();

		assert.strictEqual(detailValue('limit'), 0);
		assert.strictEqual(field('LIMIT').getValue(), 0);
	});

	test('does not touch Detail for unbound fields', async function () {
		field('NOTE').setValue('hello');
		await settle();

		assert.strictEqual(detailValue('count1'), 5);
		assert.strictEqual(edits, 0);
	});

	test('removes blocks pasted into the view, and keeps the loaded ones', async function () {
		Blockly.serialization.blocks.append({ type: 'test_number', id: 'pasted' }, view, {
			recordUndo: true
		});
		await settle();

		assert.strictEqual(view.getBlockById('pasted'), null);
		assert.ok(view.getBlockById('c1'));
	});
});
