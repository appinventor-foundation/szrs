// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * The corpus programs, written by hand for the baseline (provenance: this
 * repository, 2026-11). Each is core Blockly only, so a plain workspace loads
 * it. Several are in the style of common teaching programs; none is taken from
 * a student project. `fizzbuzz`, `countdown`, `dice-game` and `repeated-value`
 * are the same programs the dashboard's smoke check uses (rebuilt here with the
 * builders, so this package does not import from the dashboard).
 */
import {
	and,
	append,
	arith,
	bool,
	callProcedure,
	change,
	chain,
	cmp,
	defineProcedure,
	forEach,
	forRange,
	get,
	ifs,
	isEmpty,
	itemAt,
	join,
	list,
	listLength,
	mod,
	num,
	or,
	print,
	randomInt,
	repeat,
	roundDown,
	set,
	str,
	textLength,
	variables,
	whileDo,
	workspace,
	type Raw,
	type Workspace
} from './blocks.js';

export interface ProgramSource {
	id: string;
	title: string;
	/** What the program is, and what about it is hard for a zoom. */
	description: string;
	/** The author's own guess at how many concepts a reader would see. Provisional, not golden. */
	expectedConcepts: [number, number];
	/** Set for a composition of this many independent programs. */
	composedOf?: number;
	workspace: Workspace;
}

const fizzbuzz = workspace(
	[
		forRange('i', 1, 100, 1, [
			ifs(
				[
					[cmp('EQ', mod(get('i'), num(15)), num(0)), [print(str('FizzBuzz'))]],
					[cmp('EQ', mod(get('i'), num(3)), num(0)), [print(str('Fizz'))]],
					[cmp('EQ', mod(get('i'), num(5)), num(0)), [print(str('Buzz'))]]
				],
				[print(get('i'))]
			)
		])
	],
	variables('i')
);

const countdown = workspace(
	[
		chain([
			set('count', num(10)),
			whileDo(cmp('GT', get('count'), num(0)), [
				print(get('count')),
				set('count', arith('MINUS', get('count'), num(1)))
			]),
			print(str('Liftoff!'))
		])
	],
	variables('count')
);

const greeting = workspace(
	[
		defineProcedure('greet', ['person'], [], join(str('Hello, '), get('person'), str('!'))),
		print(callProcedure('greet', ['person'], [str('World')], true))
	],
	variables('person')
);

const sumList = workspace(
	[
		chain([
			set('numbers', list(num(4), num(8), num(15), num(16), num(23))),
			set('total', num(0)),
			forEach('n', get('numbers'), [set('total', arith('ADD', get('total'), get('n')))]),
			print(join(str('Total: '), get('total')))
		])
	],
	variables('numbers', 'total', 'n')
);

const largest = workspace(
	[
		defineProcedure(
			'largest',
			['a', 'b'],
			[
				ifs([[cmp('GT', get('a'), get('b')), [set('result', get('a'))]]], [set('result', get('b'))])
			],
			get('result')
		),
		print(callProcedure('largest', ['a', 'b'], [num(7), num(12)], true))
	],
	variables('a', 'b', 'result')
);

const repeatedValue = workspace(
	[repeat(7, [print(str('Hello'))]), forRange('k', 1, 7, 1, [print(get('k'))])],
	variables('k')
);

const temperature = workspace(
	[
		chain([
			set('celsius', num(22)),
			set(
				'fahrenheit',
				arith('ADD', arith('DIVIDE', arith('MULTIPLY', get('celsius'), num(9)), num(5)), num(32))
			),
			ifs(
				[[cmp('GT', get('fahrenheit'), num(80)), [print(str('Hot'))]]],
				[print(str('Comfortable'))]
			)
		])
	],
	variables('celsius', 'fahrenheit')
);

const diceGame = workspace(
	[
		defineProcedure('rollDice', [], [set('roll', randomInt(1, 6)), print(get('roll'))]),
		set('score', arith('ADD', get('score'), get('roll'))),
		defineProcedure('resetGame', [], [set('score', num(0))])
	],
	variables('roll', 'score')
);

const shoppingReceipt = workspace(
	[
		chain([
			set('prices', list(num(4), num(9), num(12), num(3))),
			set('subtotal', num(0)),
			forEach('price', get('prices'), [
				set('subtotal', arith('ADD', get('subtotal'), get('price')))
			]),
			ifs([
				[
					cmp('GT', get('subtotal'), num(20)),
					[set('subtotal', arith('MULTIPLY', get('subtotal'), num(0.9)))]
				]
			]),
			set('total', arith('MULTIPLY', get('subtotal'), num(1.08))),
			print(join(str('Total with tax: '), get('total')))
		])
	],
	variables('prices', 'subtotal', 'price', 'total')
);

const quiz = workspace(
	[
		defineProcedure(
			'grade',
			['answer', 'expected'],
			[ifs([[cmp('EQ', get('answer'), get('expected')), [change('score', num(1))]]])]
		),
		chain([
			set('score', num(0)),
			set('answers', list(str('Paris'), str('4'), str('blue'))),
			set('expectedAnswers', list(str('Paris'), str('4'), str('red'))),
			forRange('q', 1, 3, 1, [
				callProcedure(
					'grade',
					['answer', 'expected'],
					[itemAt(get('answers'), get('q')), itemAt(get('expectedAnswers'), get('q'))]
				)
			]),
			print(join(str('Score: '), get('score'), str(' of 3')))
		])
	],
	variables('answer', 'expected', 'score', 'answers', 'expectedAnswers', 'q')
);

const calculator = workspace(
	[
		defineProcedure(
			'calculate',
			['op', 'x', 'y'],
			[
				ifs(
					[
						[cmp('EQ', get('op'), str('+')), [set('answer', arith('ADD', get('x'), get('y')))]],
						[cmp('EQ', get('op'), str('-')), [set('answer', arith('MINUS', get('x'), get('y')))]],
						[
							cmp('EQ', get('op'), str('*')),
							[set('answer', arith('MULTIPLY', get('x'), get('y')))]
						],
						[
							cmp('EQ', get('op'), str('/')),
							[
								ifs(
									[[cmp('EQ', get('y'), num(0)), [set('answer', num(0))]]],
									[set('answer', arith('DIVIDE', get('x'), get('y')))]
								)
							]
						]
					],
					[set('answer', num(0))]
				)
			],
			get('answer')
		),
		print(callProcedure('calculate', ['op', 'x', 'y'], [str('+'), num(6), num(3)], true)),
		print(callProcedure('calculate', ['op', 'x', 'y'], [str('/'), num(9), num(0)], true))
	],
	variables('op', 'x', 'y', 'answer')
);

const guessingGame = workspace(
	[
		chain([
			set('secret', randomInt(1, 100)),
			set('low', num(1)),
			set('high', num(100)),
			set('tries', num(0)),
			set('guess', num(50)),
			whileDo(cmp('NEQ', get('guess'), get('secret')), [
				change('tries', num(1)),
				ifs(
					[
						[
							cmp('LT', get('guess'), get('secret')),
							[set('low', arith('ADD', get('guess'), num(1)))]
						]
					],
					[set('high', arith('MINUS', get('guess'), num(1)))]
				),
				set('guess', roundDown(arith('DIVIDE', arith('ADD', get('low'), get('high')), num(2))))
			]),
			print(join(str('Found it in '), get('tries'), str(' tries')))
		])
	],
	variables('secret', 'low', 'high', 'tries', 'guess')
);

const bankAccount = workspace(
	[
		defineProcedure(
			'deposit',
			['amount'],
			[ifs([[cmp('GT', get('amount'), num(0)), [change('balance', get('amount'))]]])]
		),
		defineProcedure(
			'withdraw',
			['amount'],
			[
				ifs(
					[
						[
							cmp('LTE', get('amount'), get('balance')),
							[change('balance', arith('MINUS', num(0), get('amount')))]
						]
					],
					[print(str('Insufficient funds'))]
				)
			]
		),
		chain([
			set('balance', num(100)),
			callProcedure('deposit', ['amount'], [num(50)]),
			callProcedure('withdraw', ['amount'], [num(500)]),
			print(join(str('Balance: '), get('balance')))
		])
	],
	variables('amount', 'balance')
);

const gradeReport = workspace(
	[
		chain([
			set('scores', list(num(91), num(78), num(64), num(55), num(88))),
			set('sum', num(0)),
			forEach('s', get('scores'), [set('sum', arith('ADD', get('sum'), get('s')))]),
			set('average', arith('DIVIDE', get('sum'), listLength(get('scores')))),
			ifs(
				[
					[cmp('GTE', get('average'), num(90)), [set('letter', str('A'))]],
					[cmp('GTE', get('average'), num(80)), [set('letter', str('B'))]],
					[cmp('GTE', get('average'), num(70)), [set('letter', str('C'))]]
				],
				[set('letter', str('F'))]
			),
			print(join(str('Average '), get('average'), str(' is grade '), get('letter')))
		])
	],
	variables('scores', 'sum', 's', 'average', 'letter')
);

// Items added to a list, with a title check, a completed list and a summary.
const todoManager = workspace(
	[
		defineProcedure(
			'addTask',
			['title'],
			[
				ifs(
					[
						[
							or(
								cmp('EQ', textLength(get('title')), num(0)),
								cmp('GT', textLength(get('title')), num(40))
							),
							[print(str('A task needs a title of 1 to 40 letters'))]
						]
					],
					[append('tasks', get('title')), print(join(str('Added: '), get('title')))]
				)
			]
		),
		defineProcedure(
			'completeTask',
			['position'],
			[
				ifs(
					[
						[
							and(
								cmp('GTE', get('position'), num(1)),
								cmp('LTE', get('position'), listLength(get('tasks')))
							),
							[
								append('finished', itemAt(get('tasks'), get('position'))),
								print(join(str('Done: '), itemAt(get('tasks'), get('position'))))
							]
						]
					],
					[print(str('No such task'))]
				)
			]
		),
		defineProcedure(
			'showTasks',
			[],
			[
				ifs(
					[[isEmpty(get('tasks')), [print(str('Nothing to do'))]]],
					[
						set('number', num(0)),
						forEach('task', get('tasks'), [
							change('number', num(1)),
							print(join(get('number'), str('. '), get('task')))
						])
					]
				)
			]
		),
		defineProcedure(
			'summary',
			[],
			[
				print(
					join(
						str('Open: '),
						listLength(get('tasks')),
						str(', finished: '),
						listLength(get('finished'))
					)
				),
				ifs([[cmp('GT', listLength(get('tasks')), num(5)), [print(str('That is a lot of tasks'))]]])
			]
		),
		chain([
			set('tasks', list()),
			set('finished', list()),
			callProcedure('addTask', ['title'], [str('Buy milk')]),
			callProcedure('addTask', ['title'], [str('')]),
			callProcedure('addTask', ['title'], [str('Call Sam')]),
			callProcedure('completeTask', ['position'], [num(1)]),
			callProcedure('showTasks', [], []),
			callProcedure('summary', [], [])
		])
	],
	variables('title', 'position', 'tasks', 'finished', 'number', 'task')
);

// Stock of three items; selling, restocking and a low-stock report.
function inventoryItem(name: string, low: number): Raw[] {
	return [
		defineProcedure(
			`sell${name}`,
			['amount'],
			[
				ifs(
					[
						[
							cmp('GTE', get(name), get('amount')),
							[set(name, arith('MINUS', get(name), get('amount'))), change('sold', get('amount'))]
						]
					],
					[print(join(str('Not enough '), str(name)))]
				),
				ifs([[cmp('LT', get(name), num(low)), [print(join(str('Low stock: '), str(name)))]]])
			]
		),
		defineProcedure(
			`restock${name}`,
			['amount'],
			[
				ifs([
					[cmp('GT', get('amount'), num(0)), [set(name, arith('ADD', get(name), get('amount')))]]
				])
			]
		)
	];
}
const inventory = workspace(
	[
		...inventoryItem('apples', 5),
		...inventoryItem('pears', 3),
		...inventoryItem('plums', 8),
		defineProcedure(
			'report',
			[],
			[
				print(join(str('Apples: '), get('apples'))),
				print(join(str('Pears: '), get('pears'))),
				print(join(str('Plums: '), get('plums'))),
				print(join(str('Sold today: '), get('sold')))
			]
		),
		chain([
			set('apples', num(20)),
			set('pears', num(10)),
			set('plums', num(15)),
			set('sold', num(0)),
			callProcedure('sellapples', ['amount'], [num(17)]),
			callProcedure('restockpears', ['amount'], [num(4)]),
			callProcedure('sellplums', ['amount'], [num(9)]),
			callProcedure('report', [], [])
		])
	],
	variables('amount', 'apples', 'pears', 'plums', 'sold')
);

// A tic-tac-toe board in a list of nine; one check per winning line.
const line = (a: number, b: number, c: number): Raw => {
	const cell = (position: number): Raw => itemAt(get('board'), num(position));
	return and(
		and(cmp('EQ', cell(a), get('player')), cmp('EQ', cell(b), get('player'))),
		cmp('EQ', cell(c), get('player'))
	);
};
const winningLines: [number, number, number][] = [
	[1, 2, 3],
	[4, 5, 6],
	[7, 8, 9],
	[1, 4, 7],
	[2, 5, 8],
	[3, 6, 9],
	[1, 5, 9],
	[3, 5, 7]
];
const ticTacToe = workspace(
	[
		defineProcedure(
			'hasWon',
			['player'],
			[
				set('won', bool(false)),
				...winningLines.map(([a, b, c]) => ifs([[line(a, b, c), [set('won', bool(true))]]]))
			],
			get('won')
		),
		defineProcedure(
			'isFull',
			[],
			[
				set('empty', num(0)),
				forEach('cell', get('board'), [
					ifs([[cmp('EQ', get('cell'), str('-')), [change('empty', num(1))]]])
				])
			],
			cmp('EQ', get('empty'), num(0))
		),
		chain([
			set(
				'board',
				list(
					str('X'),
					str('O'),
					str('X'),
					str('-'),
					str('X'),
					str('O'),
					str('O'),
					str('-'),
					str('X')
				)
			),
			ifs(
				[
					[callProcedure('hasWon', ['player'], [str('X')], true), [print(str('X wins'))]],
					[callProcedure('hasWon', ['player'], [str('O')], true), [print(str('O wins'))]],
					[callProcedure('isFull', [], [], true), [print(str('A draw'))]]
				],
				[print(str('Keep playing'))]
			)
		])
	],
	variables('player', 'won', 'empty', 'cell', 'board')
);

// Independent small programs side by side, as in an app with several unrelated
// handlers. A reader would see at least as many concepts as programs (D15).
function compose(...parts: Workspace[]): Workspace {
	const blocks = parts.flatMap((part) => part.blocks.blocks.map((block) => ({ ...block })));
	const seen = new Set<string>();
	const vars = parts
		.flatMap((part) => part.variables)
		.filter((variable) => (seen.has(variable.id) ? false : (seen.add(variable.id), true)));
	return {
		blocks: {
			languageVersion: 0,
			blocks: blocks.map((block, i) => ({ ...block, x: 30, y: 30 + i * 200 }))
		},
		variables: vars
	};
}

export const programs: ProgramSource[] = [
	{
		id: 'fizzbuzz',
		title: 'FizzBuzz',
		description: 'One purpose in one stack: a loop with an if / else-if chain.',
		expectedConcepts: [1, 1],
		workspace: fizzbuzz
	},
	{
		id: 'countdown',
		title: 'Countdown',
		description: 'A while loop that counts down from a value that could be exposed (10).',
		expectedConcepts: [1, 1],
		workspace: countdown
	},
	{
		id: 'greeting',
		title: 'Greeting function',
		description: 'A procedure that returns text, defined in one stack and called from another.',
		expectedConcepts: [1, 2],
		workspace: greeting
	},
	{
		id: 'sum-list',
		title: 'Sum of a list',
		description: 'A list of numbers added up in a loop, then printed.',
		expectedConcepts: [1, 1],
		workspace: sumList
	},
	{
		id: 'largest',
		title: 'Larger of two numbers',
		description: 'A procedure with two parameters and an if / else, then one call.',
		expectedConcepts: [1, 2],
		workspace: largest
	},
	{
		id: 'repeated-value',
		title: 'Repeated value',
		description: 'The number 7 in two separate loops that mean one thing: how many rounds.',
		expectedConcepts: [1, 2],
		workspace: repeatedValue
	},
	{
		id: 'temperature',
		title: 'Temperature check',
		description: 'A unit conversion followed by a threshold test.',
		expectedConcepts: [1, 2],
		workspace: temperature
	},
	{
		id: 'dice-game',
		title: 'Dice game',
		description:
			'Three separate stacks (a roll, a score update, a reset); the order of stacks means nothing.',
		expectedConcepts: [2, 3],
		workspace: diceGame
	},
	{
		id: 'shopping-receipt',
		title: 'Shopping receipt',
		description: 'A running subtotal, a discount over a threshold and a tax factor.',
		expectedConcepts: [1, 3],
		workspace: shoppingReceipt
	},
	{
		id: 'quiz',
		title: 'Quiz grader',
		description: 'A grading procedure and a loop over two parallel lists of answers.',
		expectedConcepts: [2, 3],
		workspace: quiz
	},
	{
		id: 'calculator',
		title: 'Calculator',
		description:
			'One procedure dispatching on an operator, with a divide-by-zero guard, and two calls.',
		expectedConcepts: [1, 3],
		workspace: calculator
	},
	{
		id: 'guessing-game',
		title: 'Guessing game (binary search)',
		description: 'A loop narrowing a range until a guess hits a random secret; counts tries.',
		expectedConcepts: [1, 2],
		workspace: guessingGame
	},
	{
		id: 'bank-account',
		title: 'Bank account',
		description:
			'Deposit and withdraw procedures over one balance, and a main sequence using them.',
		expectedConcepts: [3, 4],
		workspace: bankAccount
	},
	{
		id: 'grade-report',
		title: 'Grade report',
		description: 'An average over a list, then a letter grade chosen by an else-if chain.',
		expectedConcepts: [1, 3],
		workspace: gradeReport
	},
	{
		id: 'todo-manager',
		title: 'To-do manager',
		description:
			'Five stacks: add, complete and show tasks, a summary, and a main sequence. List edits and text checks.',
		expectedConcepts: [4, 6],
		workspace: todoManager
	},
	{
		id: 'inventory',
		title: 'Shop inventory',
		description:
			'Three items with the same sell and restock logic written out, plus a report and a main sequence.',
		expectedConcepts: [3, 6],
		workspace: inventory
	},
	{
		id: 'tic-tac-toe',
		title: 'Tic-tac-toe win check',
		description:
			'Eight near-identical winning-line tests in one procedure; a repetitive body that should be compressed.',
		expectedConcepts: [2, 4],
		workspace: ticTacToe
	},
	{
		id: 'three-programs',
		title: 'Three unrelated programs',
		description:
			'FizzBuzz, countdown and the temperature check in one workspace: at least three concepts.',
		expectedConcepts: [3, 4],
		composedOf: 3,
		workspace: compose(fizzbuzz, countdown, temperature)
	},
	{
		id: 'five-programs',
		title: 'Five unrelated programs',
		description:
			'Greeting, sum of a list, larger of two, grade report and a repeated value together: at least five concepts.',
		expectedConcepts: [5, 7],
		composedOf: 5,
		workspace: compose(greeting, sumList, largest, gradeReport, repeatedValue)
	}
];
