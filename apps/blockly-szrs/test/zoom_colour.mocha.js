// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview Tests for showing a zoom block in the colour of its anchor.
 */

const assert = require('assert');
const Blockly = require('blockly/core');
const { anchorsOf } = require('@szrs/llm-proxy-contracts/anchors');
const { applyAnchorColours } = require('../src/zoom_colour');
const { ZoomLevelLoader } = require('../src/zoom_level_loader');

const workspaceJson = (...blocks) => ({ blocks: { languageVersion: 0, blocks } });

suite('anchorsOf', function () {
	const plan = {
		concepts: [
			{ id: 'c1', stacks: ['b1', 'b2'], operations: ['s1'] },
			{ id: 'c2', stacks: [], operations: [] },
			{ stacks: ['b3'], operations: [] }
		],
		covers: { s1: ['b4', 'b1'], s2: [] }
	};

	test('gives a concept block the first stack of its concept', function () {
		assert.deepStrictEqual(anchorsOf(plan, 'concept'), { c1: 'b1' });
	});

	test('gives a Semantic block the first block it covers', function () {
		assert.deepStrictEqual(anchorsOf(plan, 'semantic'), { s1: 'b4' });
	});

	test('has none without a plan, or for a plan with no covers', function () {
		assert.deepStrictEqual(anchorsOf(undefined, 'concept'), {});
		assert.deepStrictEqual(anchorsOf(undefined, 'semantic'), {});
		assert.deepStrictEqual(anchorsOf({ concepts: plan.concepts }, 'semantic'), {});
	});
});

suite('applyAnchorColours', function () {
	/** A stand-in for a rendered workspace: only what applyAnchorColours uses. */
	function svgTarget(blockStyles, blocks) {
		const target = Object.create(Blockly.WorkspaceSvg.prototype);
		target.getTheme = () => ({ blockStyles });
		target.getBlockById = (id) => blocks[id];
		return target;
	}
	const zoomBlock = (type = 'zoom_x_op') => ({
		type,
		applied: [],
		setStyle(name) {
			this.applied.push(['style', name]);
		},
		setColour(colour) {
			this.applied.push(['colour', colour]);
		}
	});
	const anchor = (style, colour) => ({ getStyleName: () => style, getColour: () => colour });
	const detailOf = (blocks) => ({ getBlockById: (id) => blocks[id] });

	test('uses the anchor’s style when the target’s theme has it', function () {
		const block = zoomBlock();
		const target = svgTarget({ loop_blocks: {} }, { s1: block });

		applyAnchorColours(target, detailOf({ b1: anchor('loop_blocks', '#5ba55b') }), { s1: 'b1' });

		assert.deepStrictEqual(block.applied, [['style', 'loop_blocks']]);
	});

	test('copies the colour when the target’s theme lacks the style, which would draw black', function () {
		const block = zoomBlock();
		const target = svgTarget({ loop_blocks: {} }, { s1: block });

		applyAnchorColours(target, detailOf({ b1: anchor('host_only', '#aa0000') }), { s1: 'b1' });

		assert.deepStrictEqual(block.applied, [['colour', '#aa0000']]);
	});

	test('copies the colour of an anchor that has no named style', function () {
		const block = zoomBlock();
		// An automatic style is what a block set up with a bare colour has.
		const target = svgTarget({ 'auto_#123456': {} }, { s1: block });

		applyAnchorColours(target, detailOf({ b1: anchor('auto_#123456', '#123456') }), { s1: 'b1' });
		applyAnchorColours(target, detailOf({ b1: anchor('', '#654321') }), { s1: 'b1' });

		assert.deepStrictEqual(block.applied, [
			['colour', '#123456'],
			['colour', '#654321']
		]);
	});

	test('skips an anchor that is not in Detail and a zoom block that is not in the target', function () {
		const block = zoomBlock();
		const target = svgTarget({}, { s1: block });

		applyAnchorColours(target, detailOf({ b1: anchor('', '#123456') }), {
			s1: 'b99',
			s2: 'b1'
		});

		assert.deepStrictEqual(block.applied, []);
	});

	test('leaves built-in blocks kept in a level with the host’s own colour', function () {
		const block = zoomBlock('controls_if');
		const target = svgTarget({}, { s1: block });

		applyAnchorColours(target, detailOf({ b1: anchor('', '#123456') }), { s1: 'b1' });

		assert.deepStrictEqual(block.applied, []);
	});

	suite('with real blocks, in a workspace with no theme', function () {
		let detail;
		let target;
		let loader;

		suiteSetup(function () {
			Blockly.common.defineBlocksWithJsonArray([
				{ type: 'test_coloured', message0: 'host', colour: '#123456' }
			]);
		});
		suiteTeardown(function () {
			delete Blockly.Blocks['test_coloured'];
		});
		setup(function () {
			detail = new Blockly.Workspace();
			Blockly.serialization.workspaces.load(
				workspaceJson({ type: 'test_coloured', id: 'host-block' }),
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

		const level = {
			blockDefs: [{ type: 'zoom_plain_op', message0: 'do it', colour: '#7d8590' }],
			workspaceJson: workspaceJson({ type: 'zoom_plain_op', id: 's1' }),
			bindings: []
		};

		test('the loader gives a zoom block its anchor’s colour', function () {
			loader.load(level, target, detail, { s1: 'host-block' });

			assert.strictEqual(target.getBlockById('s1').getColour(), '#123456');
		});

		test('a block with no anchor keeps the colour it was defined with', function () {
			loader.load(level, target, detail);
			assert.strictEqual(target.getBlockById('s1').getColour(), '#7d8590');

			loader.load(level, target, detail, { s1: 'missing' });
			assert.strictEqual(target.getBlockById('s1').getColour(), '#7d8590');
		});
	});
});
