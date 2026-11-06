// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// The programs the zoom smoke check (smoke-zoom.ts) runs, as Blockly saves
// them. Each uses only core Blockly blocks, which is all the demo runner
// registers. Written by hand, so the script loads each into a real Blockly
// workspace first.
import { samples } from '../src/lib/samples/index.js';

export type SmokeProgram = {
	id: string;
	title: string;
	/** What the program is there to test. */
	tests: string;
	/** How many concepts a person would expect (a range), for the reader of the report. */
	expectedConcepts: string;
	/** Edit the bound field showing `from` at the Semantic level to `to`, to see what Detail does. */
	editBound?: { from: string; to: string };
	workspace: Record<string, unknown>;
};

const num = (value: number) => ({ block: { type: 'math_number', fields: { NUM: value } } });
const text = (value: string) => ({ block: { type: 'text', fields: { TEXT: value } } });
const getVar = (id: string) => ({ block: { type: 'variables_get', fields: { VAR: { id } } } });
const print = (value: unknown) => ({ type: 'text_print', inputs: { TEXT: value } });
const compare = (op: string, a: unknown, b: unknown) => ({
	block: { type: 'logic_compare', fields: { OP: op }, inputs: { A: a, B: b } }
});
const modulo = (a: unknown, divisor: number) => ({
	block: { type: 'math_modulo', inputs: { DIVIDEND: a, DIVISOR: num(divisor) } }
});
const workspace = (blocks: unknown[], variables: { name: string; id: string }[] = []) => ({
	blocks: { languageVersion: 0, blocks },
	variables
});

const fizzBuzz = workspace(
	[
		{
			type: 'controls_for',
			x: 30,
			y: 30,
			fields: { VAR: { id: 'var-i' } },
			inputs: {
				FROM: num(1),
				TO: num(100),
				BY: num(1),
				DO: {
					block: {
						type: 'controls_if',
						extraState: { elseIfCount: 2, hasElse: true },
						inputs: {
							IF0: compare('EQ', modulo(getVar('var-i'), 15), num(0)),
							DO0: { block: print(text('FizzBuzz')) },
							IF1: compare('EQ', modulo(getVar('var-i'), 3), num(0)),
							DO1: { block: print(text('Fizz')) },
							IF2: compare('EQ', modulo(getVar('var-i'), 5), num(0)),
							DO2: { block: print(text('Buzz')) },
							ELSE: { block: print(getVar('var-i')) }
						}
					}
				}
			}
		}
	],
	[{ name: 'i', id: 'var-i' }]
);

const countdown = workspace(
	[
		{
			type: 'variables_set',
			x: 30,
			y: 30,
			fields: { VAR: { id: 'var-count' } },
			inputs: { VALUE: num(10) },
			next: {
				block: {
					type: 'controls_whileUntil',
					fields: { MODE: 'WHILE' },
					inputs: {
						BOOL: compare('GT', getVar('var-count'), num(0)),
						DO: {
							block: {
								...print(getVar('var-count')),
								next: {
									block: {
										type: 'variables_set',
										fields: { VAR: { id: 'var-count' } },
										inputs: {
											VALUE: {
												block: {
													type: 'math_arithmetic',
													fields: { OP: 'MINUS' },
													inputs: { A: getVar('var-count'), B: num(1) }
												}
											}
										}
									}
								}
							}
						}
					},
					next: { block: print(text('Liftoff!')) }
				}
			}
		}
	],
	[{ name: 'count', id: 'var-count' }]
);

// Three separate stacks, as in an app with several handlers: they do not run in
// any order relative to each other.
const diceGame = workspace(
	[
		{
			type: 'procedures_defnoreturn',
			x: 30,
			y: 30,
			fields: { NAME: 'rollDice' },
			inputs: {
				STACK: {
					block: {
						type: 'variables_set',
						fields: { VAR: { id: 'var-roll' } },
						inputs: {
							VALUE: {
								block: {
									type: 'math_random_int',
									inputs: {
										FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
										TO: { shadow: { type: 'math_number', fields: { NUM: 6 } } }
									}
								}
							}
						},
						next: { block: print(getVar('var-roll')) }
					}
				}
			}
		},
		{
			type: 'variables_set',
			x: 30,
			y: 240,
			fields: { VAR: { id: 'var-score' } },
			inputs: {
				VALUE: {
					block: {
						type: 'math_arithmetic',
						fields: { OP: 'ADD' },
						inputs: { A: getVar('var-score'), B: getVar('var-roll') }
					}
				}
			}
		},
		{
			type: 'procedures_defnoreturn',
			x: 30,
			y: 380,
			fields: { NAME: 'resetGame' },
			inputs: {
				STACK: {
					block: {
						type: 'variables_set',
						fields: { VAR: { id: 'var-score' } },
						inputs: { VALUE: num(0) }
					}
				}
			}
		}
	],
	[
		{ name: 'roll', id: 'var-roll' },
		{ name: 'score', id: 'var-score' }
	]
);

// The same number, 7, in two places that mean one thing: how many rounds there are.
const repeatedValue = workspace(
	[
		{
			type: 'controls_repeat_ext',
			x: 30,
			y: 30,
			inputs: { TIMES: num(7), DO: { block: print(text('Hello')) } }
		},
		{
			type: 'controls_for',
			x: 30,
			y: 220,
			fields: { VAR: { id: 'var-n' } },
			inputs: {
				FROM: num(1),
				TO: num(7),
				BY: num(1),
				DO: { block: print(getVar('var-n')) }
			}
		}
	],
	[{ name: 'n', id: 'var-n' }]
);

export const programs: SmokeProgram[] = [
	{
		id: 'fizzbuzz',
		title: 'FizzBuzz',
		tests: 'One purpose in one stack: one concept is right.',
		expectedConcepts: '1',
		workspace: fizzBuzz
	},
	{
		id: 'countdown',
		title: 'Countdown',
		tests: 'A bound number (the 10) that can be edited at the zoomed level.',
		expectedConcepts: '1',
		editBound: { from: '10', to: '25' },
		workspace: countdown
	},
	{
		id: 'dice-game',
		title: 'Dice game',
		tests: 'Three separate stacks: three concepts, laid out without overlapping.',
		expectedConcepts: '3',
		workspace: diceGame
	},
	{
		id: 'greeting-function',
		title: 'Greeting function',
		tests: 'A procedure defined in one stack and called from another.',
		expectedConcepts: '1 to 2',
		workspace: samples['greeting-function'].workspace as Record<string, unknown>
	},
	{
		id: 'repeated-value',
		title: 'Repeated value',
		tests: 'One value (7) in two blocks: an edit must change both.',
		expectedConcepts: '1 to 2',
		editBound: { from: '7', to: '3' },
		workspace: repeatedValue
	}
];
