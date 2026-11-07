// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * Small builders for the corpus programs, so a program reads as the blocks it
 * is made of. They produce what `Blockly.serialization.workspaces.save` would:
 * a value is a raw block, an input is wrapped as `{ block }` for you, and an
 * array in an input is a stack of statements chained with `next`. Variables
 * are named, and their ids are derived from the names.
 */
export type Raw = Record<string, unknown>;
type Input = Raw | Raw[];

const wrap = (input: Input): Raw => ({ block: Array.isArray(input) ? chain(input) : input });

/** A block from its type, fields, inputs and extra state (a mutation, for blocks that have one). */
export function mk(
	type: string,
	fields: Record<string, unknown> = {},
	inputs: Record<string, Input> = {},
	extraState?: unknown
): Raw {
	// An empty stack is no input at all.
	const present = Object.entries(inputs).filter(
		([, input]) => !Array.isArray(input) || input.length > 0
	);
	return {
		type,
		...(Object.keys(fields).length > 0 && { fields }),
		...(present.length > 0 && {
			inputs: Object.fromEntries(present.map(([name, input]) => [name, wrap(input)]))
		}),
		...(extraState !== undefined && { extraState })
	};
}

/** Statements in order: each one's `next` is the one after it. */
export function chain(blocks: Raw[]): Raw {
	const [first, ...rest] = blocks;
	if (first === undefined) throw new Error('An empty stack has no first block');
	return rest.length === 0 ? first : { ...first, next: { block: chain(rest) } };
}

export const varId = (name: string): string => `var-${name}`;
export const variables = (...names: string[]) => names.map((name) => ({ name, id: varId(name) }));

export const num = (value: number): Raw => mk('math_number', { NUM: value });
export const str = (value: string): Raw => mk('text', { TEXT: value });
export const bool = (value: boolean): Raw =>
	mk('logic_boolean', { BOOL: value ? 'TRUE' : 'FALSE' });
export const get = (name: string): Raw => mk('variables_get', { VAR: { id: varId(name) } });
export const set = (name: string, value: Raw): Raw =>
	mk('variables_set', { VAR: { id: varId(name) } }, { VALUE: value });
export const change = (name: string, by: Raw): Raw =>
	mk('math_change', { VAR: { id: varId(name) } }, { DELTA: by });
export const print = (value: Raw): Raw => mk('text_print', {}, { TEXT: value });
export const join = (...parts: Raw[]): Raw =>
	mk('text_join', {}, Object.fromEntries(parts.map((part, i) => [`ADD${i}`, part])), {
		itemCount: parts.length
	});

export const cmp = (op: 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE', a: Raw, b: Raw): Raw =>
	mk('logic_compare', { OP: op }, { A: a, B: b });
export const and = (a: Raw, b: Raw): Raw => mk('logic_operation', { OP: 'AND' }, { A: a, B: b });
export const or = (a: Raw, b: Raw): Raw => mk('logic_operation', { OP: 'OR' }, { A: a, B: b });
export const not = (a: Raw): Raw => mk('logic_negate', {}, { BOOL: a });
export const arith = (op: 'ADD' | 'MINUS' | 'MULTIPLY' | 'DIVIDE' | 'POWER', a: Raw, b: Raw): Raw =>
	mk('math_arithmetic', { OP: op }, { A: a, B: b });
export const mod = (a: Raw, b: Raw): Raw => mk('math_modulo', {}, { DIVIDEND: a, DIVISOR: b });
export const randomInt = (from: number, to: number): Raw =>
	mk('math_random_int', {}, { FROM: num(from), TO: num(to) });
export const roundDown = (a: Raw): Raw => mk('math_round', { OP: 'ROUNDDOWN' }, { NUM: a });
export const textLength = (a: Raw): Raw => mk('text_length', {}, { VALUE: a });

/** if / else if / else. Each branch is a condition and the statements to run. */
export function ifs(branches: [Raw, Raw[]][], otherwise?: Raw[]): Raw {
	const inputs: Record<string, Input> = {};
	branches.forEach(([condition, body], i) => {
		inputs[`IF${i}`] = condition;
		inputs[`DO${i}`] = body;
	});
	if (otherwise) inputs.ELSE = otherwise;
	return mk('controls_if', {}, inputs, {
		...(branches.length > 1 && { elseIfCount: branches.length - 1 }),
		...(otherwise && { hasElse: true })
	});
}
export const repeat = (times: number, body: Raw[]): Raw =>
	mk('controls_repeat_ext', {}, { TIMES: num(times), DO: body });
export const whileDo = (condition: Raw, body: Raw[]): Raw =>
	mk('controls_whileUntil', { MODE: 'WHILE' }, { BOOL: condition, DO: body });
export const forRange = (name: string, from: number, to: number, by: number, body: Raw[]): Raw =>
	mk(
		'controls_for',
		{ VAR: { id: varId(name) } },
		{ FROM: num(from), TO: num(to), BY: num(by), DO: body }
	);
export const forEach = (name: string, list: Raw, body: Raw[]): Raw =>
	mk('controls_forEach', { VAR: { id: varId(name) } }, { LIST: list, DO: body });

export const list = (...items: Raw[]): Raw =>
	mk('lists_create_with', {}, Object.fromEntries(items.map((item, i) => [`ADD${i}`, item])), {
		itemCount: items.length
	});
export const listLength = (a: Raw): Raw => mk('lists_length', {}, { VALUE: a });
export const isEmpty = (a: Raw): Raw => mk('lists_isEmpty', {}, { VALUE: a });
/** The item at a 1-based position. */
export const itemAt = (listBlock: Raw, position: Raw): Raw =>
	mk(
		'lists_getIndex',
		{ MODE: 'GET', WHERE: 'FROM_START' },
		{ VALUE: listBlock, AT: position },
		{ isStatement: false, isAtField: true }
	);
/** Adds an item at the end of a list held in a variable. */
export const append = (name: string, item: Raw): Raw =>
	mk(
		'lists_setIndex',
		{ MODE: 'INSERT', WHERE: 'LAST' },
		{ LIST: get(name), TO: item },
		{ isAtField: false }
	);

export type Param = string;
export const defineProcedure = (name: string, params: Param[], body: Raw[], returns?: Raw): Raw =>
	mk(
		returns ? 'procedures_defreturn' : 'procedures_defnoreturn',
		{ NAME: name },
		{ STACK: body, ...(returns && { RETURN: returns }) },
		{ params: params.map((param) => ({ name: param, id: varId(param) })) }
	);
export const callProcedure = (name: string, params: Param[], args: Raw[], returns = false): Raw =>
	mk(
		returns ? 'procedures_callreturn' : 'procedures_callnoreturn',
		{},
		Object.fromEntries(args.map((arg, i) => [`ARG${i}`, arg])),
		{ name, params }
	);

/** A workspace from its top-level stacks, laid out in a column. */
export function workspace(stacks: Raw[], vars: { name: string; id: string }[] = []) {
	return {
		blocks: {
			languageVersion: 0,
			blocks: stacks.map((stack, i) => ({ ...stack, x: 30, y: 30 + i * 200 }))
		},
		variables: vars
	};
}
export type Workspace = ReturnType<typeof workspace>;
