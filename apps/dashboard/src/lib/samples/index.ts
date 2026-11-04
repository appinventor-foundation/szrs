// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Workspace } from '#lib/schemas/workspace.js';

// Starter programs a demo can pick. Each is a Blockly serialization (what
// `Blockly.serialization.workspaces.save` returns). A demo stores only the id,
// so improving a sample here improves every demo that uses it.
export const SAMPLE_IDS = ['counting-loop', 'greeting-function', 'shopping-total'] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

export type Sample = { id: SampleId; title: string; description: string; workspace: Workspace };

const num = (value: number) => ({ block: { type: 'math_number', fields: { NUM: value } } });
const text = (value: string) => ({ block: { type: 'text', fields: { TEXT: value } } });
const getVar = (id: string) => ({ block: { type: 'variables_get', fields: { VAR: { id } } } });

const countingLoop: Workspace = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'controls_for',
				x: 30,
				y: 30,
				fields: { VAR: { id: 'var-i' } },
				inputs: {
					FROM: num(1),
					TO: num(10),
					BY: num(1),
					DO: {
						block: {
							type: 'controls_if',
							extraState: { hasElse: true },
							inputs: {
								IF0: {
									block: {
										type: 'logic_compare',
										fields: { OP: 'EQ' },
										inputs: {
											A: {
												block: {
													type: 'math_modulo',
													inputs: { DIVIDEND: getVar('var-i'), DIVISOR: num(2) }
												}
											},
											B: num(0)
										}
									}
								},
								DO0: {
									block: {
										type: 'text_print',
										inputs: {
											TEXT: {
												block: {
													type: 'text_join',
													extraState: { itemCount: 2 },
													inputs: { ADD0: getVar('var-i'), ADD1: text(' is even') }
												}
											}
										}
									}
								},
								ELSE: {
									block: {
										type: 'text_print',
										inputs: { TEXT: getVar('var-i') }
									}
								}
							}
						}
					}
				}
			}
		]
	},
	variables: [{ name: 'i', id: 'var-i' }]
};

const greetingFunction: Workspace = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'procedures_defreturn',
				x: 30,
				y: 30,
				extraState: { params: [{ name: 'person', id: 'var-person' }] },
				fields: { NAME: 'greet' },
				inputs: {
					RETURN: {
						block: {
							type: 'text_join',
							extraState: { itemCount: 3 },
							inputs: { ADD0: text('Hello, '), ADD1: getVar('var-person'), ADD2: text('!') }
						}
					}
				}
			},
			{
				type: 'text_print',
				x: 30,
				y: 220,
				inputs: {
					TEXT: {
						block: {
							type: 'procedures_callreturn',
							extraState: { name: 'greet', params: ['person'] },
							inputs: { ARG0: text('World') }
						}
					}
				}
			}
		]
	},
	variables: [{ name: 'person', id: 'var-person' }]
};

const shoppingTotal: Workspace = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'variables_set',
				x: 30,
				y: 30,
				fields: { VAR: { id: 'var-price' } },
				inputs: { VALUE: num(20) },
				next: {
					block: {
						type: 'variables_set',
						fields: { VAR: { id: 'var-count' } },
						inputs: { VALUE: num(3) },
						next: {
							block: {
								type: 'variables_set',
								fields: { VAR: { id: 'var-total' } },
								inputs: {
									VALUE: {
										block: {
											type: 'math_arithmetic',
											fields: { OP: 'MULTIPLY' },
											inputs: { A: getVar('var-price'), B: getVar('var-count') }
										}
									}
								},
								next: {
									block: {
										type: 'controls_if',
										extraState: { hasElse: true },
										inputs: {
											IF0: {
												block: {
													type: 'logic_compare',
													fields: { OP: 'GT' },
													inputs: { A: getVar('var-total'), B: num(50) }
												}
											},
											DO0: {
												block: {
													type: 'text_print',
													inputs: { TEXT: text('Free shipping') }
												}
											},
											ELSE: {
												block: {
													type: 'text_print',
													inputs: { TEXT: getVar('var-total') }
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		]
	},
	variables: [
		{ name: 'price', id: 'var-price' },
		{ name: 'count', id: 'var-count' },
		{ name: 'total', id: 'var-total' }
	]
};

export const samples: Record<SampleId, Sample> = {
	'counting-loop': {
		id: 'counting-loop',
		title: 'Counting loop',
		description: 'A loop from 1 to 10 that reports which numbers are even.',
		workspace: countingLoop
	},
	'greeting-function': {
		id: 'greeting-function',
		title: 'Greeting function',
		description: 'A function with a parameter that builds a greeting, and a call to it.',
		workspace: greetingFunction
	},
	'shopping-total': {
		id: 'shopping-total',
		title: 'Shopping total',
		description: 'Variables for a price and a quantity, and a decision on the total.',
		workspace: shoppingTotal
	}
};

export function isSampleId(value: unknown): value is SampleId {
	return typeof value === 'string' && (SAMPLE_IDS as readonly string[]).includes(value);
}

// How a demo's starting program reads on a page.
export function describeStarter(demo: {
	starterKind: 'empty' | 'sample' | 'custom';
	sampleId: string | null;
}): string {
	if (demo.starterKind === 'sample' && isSampleId(demo.sampleId)) {
		return `Example: ${samples[demo.sampleId].title}`;
	}
	if (demo.starterKind === 'custom') return 'A saved program';
	return 'Empty workspace';
}
