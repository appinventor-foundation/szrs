import { allBlocks, byId, isRecord, nestedHolders } from './saved-blocks.js';

/**
 * Fixes mistakes in a model's zoom result that have exactly one correct fix,
 * so they don't cost a retry (DECISIONS.md #11). Works on the parsed JSON
 * before it's validated, changes it in place, and leaves anything it doesn't
 * recognise for validation to report. Returns a description of each repair.
 */
export function repairZoomResult(raw: unknown, detailWorkspace: Record<string, unknown>): string[] {
	const repairs: string[] = [];
	if (!isRecord(raw)) return repairs;
	const detail = byId(allBlocks(detailWorkspace));

	for (const name of ['semantic', 'concept']) {
		const level = raw[name];
		if (!isRecord(level)) continue;
		const defs = (Array.isArray(level.blockDefs) ? level.blockDefs : []).filter(isRecord);
		const defsByType = new Map(
			defs.flatMap((def): [string, Record<string, unknown>][] =>
				typeof def.type === 'string' ? [[def.type, def]] : []
			)
		);

		const blocks = isRecord(level.workspaceJson) ? allBlocks(level.workspaceJson) : [];
		for (const block of blocks) {
			const def = defsByType.get(block.type);
			if (!def) continue;
			if (block.next !== undefined && !('nextStatement' in def)) {
				def.nextStatement = null;
				repairs.push(`${name}: added "nextStatement" to ${block.type}, which has a block after it`);
			}
			for (const [input, value] of Object.entries(block.inputs ?? {})) {
				if (declaresInput(def, input)) continue;
				const kind = inputKind(value, defsByType);
				if (kind && addArg(def, { type: kind, name: input })) {
					repairs.push(
						`${name}: added ${kind} "${input}" to ${block.type}, which has a block in it`
					);
				}
			}
		}

		for (const def of defs) repairPlaceholders(def, name, repairs);

		const bindings = (Array.isArray(level.bindings) ? level.bindings : []).filter(isRecord);
		bindings.forEach((binding, i) => {
			for (const ref of (Array.isArray(binding.detail) ? binding.detail : []).filter(isRecord)) {
				const target = typeof ref.block === 'string' ? detail.get(ref.block) : undefined;
				if (!target || typeof ref.field !== 'string' || target.fields?.[ref.field] !== undefined) {
					continue;
				}
				const holders = nestedHolders(target, ref.field);
				if (holders.length === 1 && holders[0].id !== undefined) {
					repairs.push(
						`${name}.bindings[${i}]: moved from ${target.type} "${ref.block}" to the ${holders[0].type} "${holders[0].id}" inside it, which holds ${ref.field}`
					);
					ref.block = holders[0].id;
				}
			}
		});
	}
	return repairs;
}

function argLists(def: Record<string, unknown>): [string, unknown[]][] {
	return Object.entries(def).flatMap(([key, value]): [string, unknown[]][] => {
		const n = /^args(\d+)$/.exec(key)?.[1];
		return n !== undefined && Array.isArray(value) ? [[n, value]] : [];
	});
}

function declaresInput(def: Record<string, unknown>, name: string): boolean {
	return argLists(def).some(([, args]) =>
		args.some(
			(arg) =>
				isRecord(arg) &&
				arg.name === name &&
				(arg.type === 'input_value' || arg.type === 'input_statement')
		)
	);
}

/** Which kind of input a child block needs, when that can be told from the child alone. */
function inputKind(
	input: unknown,
	defs: Map<string, Record<string, unknown>>
): 'input_statement' | 'input_value' | null {
	if (!isRecord(input)) return null;
	const child = isRecord(input.block) ? input.block : isRecord(input.shadow) ? input.shadow : null;
	if (!child) return null;
	if (isRecord(child.next)) return 'input_statement';
	const childDef = typeof child.type === 'string' ? defs.get(child.type) : undefined;
	if (childDef && 'output' in childDef) return 'input_value';
	if (childDef && 'previousStatement' in childDef) return 'input_statement';
	return null;
}

/** Adds an arg to args0 and its placeholder to message0. Returns false if message0 isn't a string. */
function addArg(def: Record<string, unknown>, arg: { type: string; name: string }): boolean {
	if (typeof def.message0 !== 'string') return false;
	const args = Array.isArray(def.args0) ? def.args0 : [];
	args.push(arg);
	def.args0 = args;
	def.message0 = `${def.message0} %${args.length}`;
	return true;
}

/** Appends the %N placeholders a message is missing, if it has no out-of-range or repeated ones. */
function repairPlaceholders(def: Record<string, unknown>, level: string, repairs: string[]): void {
	for (const [n, args] of argLists(def)) {
		const message = def[`message${n}`];
		if (typeof message !== 'string') continue;
		const refs = [...message.matchAll(/%(\d+)/g)].map((m) => Number(m[1]));
		const valid = refs.every((ref) => ref >= 1 && ref <= args.length);
		if (!valid || new Set(refs).size !== refs.length) continue;
		const missing = Array.from({ length: args.length }, (_, i) => i + 1).filter(
			(i) => !refs.includes(i)
		);
		if (missing.length === 0) continue;
		def[`message${n}`] = `${message} ${missing.map((i) => `%${i}`).join(' ')}`;
		repairs.push(
			`${level}: added ${missing.map((i) => `%${i}`).join(' ')} to ${String(def.type)}'s message${n}`
		);
	}
}
