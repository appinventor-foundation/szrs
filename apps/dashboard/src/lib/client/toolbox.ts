// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// The blocks a demo offers: Blockly's standard ones, in its standard
// categories. (The plugin's own playground borrows a toolbox from a dev
// dependency, so the dashboard keeps its own.)
const blocks = (...types: string[]) => types.map((type) => ({ kind: 'block', type }));

export const toolbox = {
	kind: 'categoryToolbox',
	contents: [
		{
			kind: 'category',
			name: 'Logic',
			categorystyle: 'logic_category',
			contents: blocks(
				'controls_if',
				'logic_compare',
				'logic_operation',
				'logic_negate',
				'logic_boolean'
			)
		},
		{
			kind: 'category',
			name: 'Loops',
			categorystyle: 'loop_category',
			contents: blocks(
				'controls_repeat_ext',
				'controls_whileUntil',
				'controls_for',
				'controls_forEach',
				'controls_flow_statements'
			)
		},
		{
			kind: 'category',
			name: 'Math',
			categorystyle: 'math_category',
			contents: blocks(
				'math_number',
				'math_arithmetic',
				'math_modulo',
				'math_random_int',
				'math_round'
			)
		},
		{
			kind: 'category',
			name: 'Text',
			categorystyle: 'text_category',
			contents: blocks('text', 'text_join', 'text_length', 'text_print')
		},
		{
			kind: 'category',
			name: 'Lists',
			categorystyle: 'list_category',
			contents: blocks('lists_create_with', 'lists_length', 'lists_getIndex', 'lists_setIndex')
		},
		{ kind: 'sep' },
		{ kind: 'category', name: 'Variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
		{
			kind: 'category',
			name: 'Functions',
			categorystyle: 'procedure_category',
			custom: 'PROCEDURE'
		}
	]
};
