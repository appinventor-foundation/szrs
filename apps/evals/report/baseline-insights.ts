// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * What the baseline report says about its own numbers: what each chart means, the
 * findings that can be computed (counts and comparisons, not judgments), the effect
 * of changing the prompt per model, a compact grid of every program, and a glossary.
 * Everything here is computed from the scored records; nothing is written by hand
 * about a particular run, so it stays true when the results change.
 */
import { findProgram } from '../baseline/corpus/index.js';
import type { Metrics } from '../baseline/record.js';
import type { BaselineFile, rescore } from '../baseline/summary.js';
import { esc, fmt } from './html.js';
import { modelVia, type MetricGroup, type MetricInfo } from './rows.js';

type Scored = ReturnType<typeof rescore>;
interface Run {
	model: string;
	prompt: string;
	program: string;
	tier: string;
	stacks: number;
	m: Metrics;
	/** Input tokens the provider counted on the first attempt. */
	input?: number;
}

export const BASELINE_METRICS: Record<string, MetricInfo> = {
	valid: {
		label: 'Valid runs',
		code: 'D1',
		kind: 'rate',
		better: 'higher',
		about:
			'Share of runs that ended with a zoom that passes the schema and the checks against the Detail program. Valid means usable, not good.'
	},
	validFirstAttempt: {
		label: 'Valid on the first attempt',
		code: 'D2',
		kind: 'rate',
		better: 'higher',
		about: 'Share of runs whose first answer was already valid, with no retry.'
	},
	attempts: {
		label: 'Attempts per run',
		code: 'D3',
		better: 'lower',
		decimals: 2,
		about: 'Model calls per run, at most 3. 1 means the first answer was usable.'
	},
	loads: {
		label: 'Valid zooms whose levels load in Blockly',
		code: 'D5',
		kind: 'rate',
		better: 'higher',
		about:
			'Of the valid zooms, the share where both levels load into a Blockly workspace. Anything below 100% is a mistake the proxy’s checks let through.'
	},
	repairs: {
		label: 'Automatic repairs per run',
		code: 'D4',
		better: 'lower',
		decimals: 2,
		about: 'Fixes the proxy made to the output itself, for mistakes with exactly one correct fix.'
	},
	truncated: {
		label: 'Cut off at the output cap',
		code: 'D26',
		kind: 'rate',
		better: 'lower',
		about: 'Share of runs where an answer hit the 32,768-token output cap.'
	},
	timedOut: {
		label: 'Timed out',
		kind: 'rate',
		better: 'lower',
		about: 'Share of runs where the call itself took too long. Not about what the model wrote.'
	},
	conceptCountInRange: {
		label: 'Concept count in the expected range',
		code: 'D14',
		kind: 'rate',
		better: 'higher',
		about:
			'Of the valid zooms, the share whose number of Concept blocks is in the range the corpus author guessed for that program. The ranges are provisional, not golden annotations.'
	},
	stackSplit: {
		label: 'Semantic stacks split apart',
		code: 'D28',
		kind: 'rate',
		better: 'lower',
		about:
			'Of the valid zooms, the share whose Semantic level has more top-level blocks than the program has top-level stacks. It means operations of one stack were left as separate blocks instead of being connected. A proxy: more blocks than stacks is consistent with a split, not proof of one.'
	},
	compositionRecall: {
		label: 'Compositions that got at least one concept per program',
		code: 'D15',
		kind: 'rate',
		better: 'higher',
		about:
			'For the workspaces that put several unrelated programs side by side: the share of valid zooms with at least as many concepts as programs.'
	},
	conceptCount: {
		label: 'Concept blocks',
		about:
			'Top-level blocks at the Concept level. Compare it with the number of top-level stacks in the program, not with zero.'
	},
	planCoversStacks: {
		label: 'Stacks the plan accounts for',
		code: 'D11',
		kind: 'rate',
		better: 'higher',
		about:
			'Share of the program’s top-level stacks that belong to exactly one concept in the model’s own plan. Only prompts that ask for a plan have one.'
	},
	semanticCompression: {
		label: 'Semantic size relative to Detail',
		code: 'D12',
		decimals: 2,
		about: 'Blocks at the Semantic level divided by blocks in Detail. Lower is more compressed.'
	},
	conceptCompression: {
		label: 'Concept size relative to Detail',
		code: 'D12',
		decimals: 2,
		about: 'Blocks at the Concept level divided by blocks in Detail. Lower is more compressed.'
	},
	monotonic: {
		label: 'Levels shrink from Detail to Concept',
		code: 'D13',
		kind: 'rate',
		better: 'higher',
		about:
			'Share of valid zooms where Detail is larger than Semantic, Semantic is at least as large as Concept, and Concept has no more top-level blocks than Semantic.'
	},
	redundancy: {
		label: 'Overlap between the two levels’ labels',
		code: 'D18',
		better: 'lower',
		decimals: 2,
		about:
			'How alike the words on the Semantic and Concept levels are, from 0 (nothing shared) to 1 (the same words).'
	},
	valueLeaks: {
		label: 'Detail values repeated in labels',
		code: 'D17',
		better: 'lower',
		decimals: 1,
		about:
			'Labels or tooltips of a valid zoom that contain a number or text that is also a value in Detail, so the label goes stale when the value changes.'
	},
	namingProblems: {
		label: 'Naming problems',
		code: 'D16',
		better: 'lower',
		decimals: 2,
		about: 'Block types that break the naming rules, and duplicate or missing block ids.'
	},
	bindingValidity: {
		label: 'Bindings that point at real Detail fields',
		code: 'D6',
		kind: 'rate',
		better: 'higher',
		about:
			'Share of the zoom’s bindings that name a Detail field that exists and has the right kind.'
	},
	semanticAnchored: {
		label: 'Semantic blocks the plan gives an anchor',
		code: 'D23',
		kind: 'rate',
		better: 'higher',
		about:
			'Of the blocks in the Semantic level, the share the plan names a Detail block for (its anchor), which gives the block its colour. Without one the block is drawn in the default grey. A prompt with no covers (v0 to v2) has none. The bar is the mean over runs of each run’s share.'
	},
	semanticAnchorsResolved: {
		label: 'Semantic anchors that are Detail blocks',
		code: 'D23',
		kind: 'rate',
		better: 'higher',
		about:
			'Of the Semantic anchors the plan names, the share that are blocks of the Detail program. An anchor that is not gives the block the default grey. The plan’s target is at least 95%. It says the ids are real, not that the block is the right one.'
	},
	conceptAnchorsResolved: {
		label: 'Concept anchors that are Detail blocks',
		code: 'D23',
		kind: 'rate',
		better: 'higher',
		about:
			'Of the Concept blocks, the share whose first listed stack is a block of the Detail program. A v1 or later plan has these; a v2 plan has them too.'
	},
	anchorFlagged: {
		label: 'Semantic anchors flagged by D24a',
		code: 'D24a',
		kind: 'rate',
		better: 'lower',
		about:
			'Of the Semantic anchors that are Detail blocks, the share that break a structural rule: a statement block anchored on a value block (or the reverse), or a value the block edits that is not inside its anchor. A candidate generator for labels, not a verdict: it flags real errors and also some correct anchors (a “return” block on a value).'
	},
	costUsd: {
		label: 'Cost per run (US dollars)',
		code: 'D21',
		better: 'lower',
		decimals: 4,
		about: 'What OpenRouter reported for the run’s calls, retries included.'
	},
	totalSeconds: {
		label: 'Seconds per run',
		code: 'D21',
		unit: ' s',
		better: 'lower',
		about: 'Wall-clock time of the run’s calls, retries included.'
	},
	promptTokens: {
		label: 'Input tokens (first attempt)',
		code: 'D27',
		about:
			'Input tokens as the provider counted them. The text sent is identical for every model, so differences between models are how each provider counts it; differences between programs are the program’s size.'
	},
	completionTokens: {
		label: 'Output tokens (reasoning included)',
		code: 'D21',
		better: 'lower',
		about: 'Tokens the model produced over all attempts, hidden reasoning included.'
	},
	reasoningTokens: {
		label: 'Reasoning tokens',
		about:
			'The part of the output tokens a model spent reasoning before it answered, where the provider says.'
	}
};

export const BASELINE_CHART_GROUPS: MetricGroup[] = [
	{
		title: 'Does it work?',
		description:
			'Whether a run ended with something the proxy would accept, and how much it took to get there.',
		keys: ['valid', 'validFirstAttempt', 'attempts', 'loads', 'repairs', 'truncated', 'timedOut']
	},
	{
		title: 'Does it abstract?',
		description:
			'The shape of the zoomed program: how many concepts, how much smaller than Detail, how consistent. Nothing here says whether the abstraction is right.',
		keys: [
			'conceptCountInRange',
			'compositionRecall',
			'conceptCount',
			'stackSplit',
			'planCoversStacks',
			'semanticCompression',
			'conceptCompression',
			'monotonic',
			'redundancy'
		]
	},
	{
		title: 'Labels and bindings',
		description: 'Properties of the words and the links to Detail.',
		keys: ['valueLeaks', 'namingProblems', 'bindingValidity']
	},
	{
		title: 'Colour anchors',
		description:
			'Whether the plan names the Detail block each zoom block stands for, and whether those names are real (v3 on). Nothing here says the block is the right one: that needs labels.',
		keys: ['semanticAnchored', 'semanticAnchorsResolved', 'conceptAnchorsResolved', 'anchorFlagged']
	},
	{
		title: 'Cost, time and size',
		description: 'What a run costs, how long it takes, and how much text goes in and out.',
		keys: ['costUsd', 'totalSeconds', 'promptTokens', 'completionTokens', 'reasoningTokens']
	}
];

// ---------------------------------------------------------------------------

function runsOf(scored: Scored): Run[] {
	return scored.flatMap(({ record, metrics }) =>
		metrics
			? [
					{
						model: record.model.id,
						prompt: record.prompt.id,
						program: record.program.id,
						tier: record.program.tier,
						stacks: record.program.topLevelStacks,
						m: metrics,
						input: record.attempts[0]?.usage?.promptTokens
					}
				]
			: []
	);
}

/** 100 times the sum of `part` over the sum of `whole`, over runs that have both; NaN when none do. */
function pooled(
	runs: Run[],
	part: (m: Metrics) => number | undefined,
	whole: (m: Metrics) => number | undefined
): number {
	let p = 0;
	let w = 0;
	for (const run of runs) {
		const a = part(run.m);
		const b = whole(run.m);
		if (a !== undefined && b !== undefined) {
			p += a;
			w += b;
		}
	}
	return w > 0 ? (100 * p) / w : NaN;
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const mean = (values: number[]): number =>
	values.length === 0 ? NaN : sum(values) / values.length;
const pct = (part: number, whole: number): string =>
	whole === 0 ? 'n/a' : `${Math.round((100 * part) / whole)}%`;
const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[mid] ?? NaN)
		: ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const KIND_WORDS: Record<string, string> = {
	parse: 'not valid JSON',
	schema: 'the wrong shape',
	validation: 'did not fit the Detail program',
	truncated: 'cut off at the output cap',
	timeout: 'timed out',
	other: 'the call failed'
};

function nameOf(file: BaselineFile, id: string): string {
	return file.models?.[id]?.model ?? id;
}
function viaOf(file: BaselineFile, id: string): string {
	const found = file.models?.[id];
	return found ? modelVia({ provider: found.provider, vendor: found.vendor }) : '';
}

/** Short names for a failure, to fit a narrow cell; the grid's legend spells them out. */
const SHORT_KIND: Record<string, string> = {
	parse: 'JSON',
	schema: 'schema',
	validation: 'detail',
	truncated: 'cap',
	timeout: 'time',
	other: 'call'
};

const code = (text: string): string => `<code>${esc(text)}</code>`;
const strong = (text: string): string => `<strong>${esc(text)}</strong>`;

/** The findings that can be computed, as a list. Counts and comparisons, never a judgment of quality. */
export function standsOut(file: BaselineFile, scored: Scored): string {
	const runs = runsOf(scored);
	const prompts = [...new Set(runs.map((run) => run.prompt))].sort();
	const models = [...new Set(runs.map((run) => run.model))];
	const items: string[] = [];
	const ofPrompt = (prompt: string): Run[] => runs.filter((run) => run.prompt === prompt);
	const validOf = (list: Run[]): Run[] => list.filter((run) => run.m.valid);

	// 1. Validity by prompt.
	items.push(
		`<strong>Valid runs.</strong> ${prompts
			.map((prompt) => {
				const list = ofPrompt(prompt);
				const valid = validOf(list).length;
				const first = list.filter((run) => run.m.validFirstAttempt).length;
				const timeouts = list.filter((run) => run.m.failure === 'timeout').length;
				return `${code(prompt)}: ${strong(`${valid} of ${list.length}`)} (${pct(valid, list.length)}), ${first} on the first attempt${timeouts > 0 ? `; ${timeouts} of the failures were timeouts` : ''}`;
			})
			.join('. ')}.`
	);

	// 2. What changing the prompt did, per model.
	const [base, other] = prompts;
	if (base !== undefined && other !== undefined) {
		const change = models.map((model) => {
			const a = runs.filter((run) => run.model === model && run.prompt === base);
			const b = runs.filter((run) => run.model === model && run.prompt === other);
			const av = validOf(a).length;
			const bv = validOf(b).length;
			return { model, a: a.length, b: b.length, av, bv, delta: bv / b.length - av / a.length };
		});
		const describe = (c: (typeof change)[number]): string =>
			`${esc(nameOf(file, c.model))} (${c.av} to ${c.bv} of ${c.a})`;
		const gains = change.filter((c) => c.delta >= 0.1).sort((x, y) => y.delta - x.delta);
		const losses = change.filter((c) => c.delta <= -0.1).sort((x, y) => x.delta - y.delta);
		const flat = change.length - gains.length - losses.length;
		items.push(
			`<strong>Changing the prompt from ${code(base)} to ${code(other)}</strong> changed the share of valid runs by 10 points or more for ${gains.length + losses.length} of ${change.length} models.${gains.length > 0 ? ` Up: ${gains.map(describe).join(', ')}.` : ''}${losses.length > 0 ? ` Down: ${losses.map(describe).join(', ')}.` : ''}${flat > 0 ? ` ${flat} changed less than that.` : ''}`
		);
	}

	// 3. Which models were reliable, which were not.
	const reliability = models.map((model) => {
		const rates = prompts.map((prompt) => {
			const list = runs.filter((run) => run.model === model && run.prompt === prompt);
			return list.length === 0 ? 1 : validOf(list).length / list.length;
		});
		return { model, min: Math.min(...rates) };
	});
	const solid = reliability.filter((r) => r.min >= 0.95);
	const weakest = [...reliability].sort((x, y) => x.min - y.min).slice(0, 3);
	if (models.length >= 4) {
		items.push(
			`<strong>By how often the output was valid,</strong> ${solid.length > 0 ? `${solid.map((r) => esc(nameOf(file, r.model))).join(', ')} ${solid.length === 1 ? 'was' : 'were'} valid in at least 95% of runs with every prompt. ` : 'no model was valid in 95% of runs with every prompt. '}The lowest: ${weakest.map((r) => `${esc(nameOf(file, r.model))} (${Math.round(100 * r.min)}% with its worst prompt)`).join(', ')}.`
		);
	}

	// 4. How many concepts, on programs that have several stacks.
	const several = (list: Run[]): Run[] => validOf(list).filter((run) => run.stacks >= 2);
	if (prompts.length > 0 && prompts.some((prompt) => several(ofPrompt(prompt)).length > 0)) {
		items.push(
			`<strong>Concept count on programs with two or more top-level stacks:</strong> ${prompts
				.map((prompt) => {
					const list = several(ofPrompt(prompt));
					const one = list.filter((run) => run.m.conceptCount === 1).length;
					return `${code(prompt)} gave exactly one concept in ${strong(`${one} of ${list.length}`)} valid zooms (${pct(one, list.length)})`;
				})
				.join('; ')}. Overall, the concept count was in the author’s provisional range in ${prompts
				.map((prompt) => {
					const list = validOf(ofPrompt(prompt));
					const inRange = list.filter((run) => run.m.conceptCountInRange).length;
					return `${pct(inRange, list.length)} of ${code(prompt)}`;
				})
				.join(' and ')} valid zooms.`
		);
	}

	// 5. Compositions of unrelated programs.
	const compositions = prompts.map((prompt) => {
		const list = validOf(ofPrompt(prompt)).filter((run) => run.m.compositionRecall !== undefined);
		return { prompt, list, ok: list.filter((run) => run.m.compositionRecall).length };
	});
	if (compositions.some((c) => c.list.length > 0)) {
		items.push(
			`<strong>Workspaces made of several unrelated programs</strong> got at least one concept per program in ${compositions.map((c) => `${strong(`${c.ok} of ${c.list.length}`)} valid zooms with ${code(c.prompt)}`).join(' and ')}.`
		);
	}

	// 6. Why runs failed.
	const failureLine = prompts.map((prompt) => {
		const counts = new Map<string, number>();
		for (const run of ofPrompt(prompt)) {
			if (!run.m.valid)
				counts.set(run.m.failure ?? 'other', (counts.get(run.m.failure ?? 'other') ?? 0) + 1);
		}
		const parts = [...counts]
			.sort((x, y) => y[1] - x[1])
			.map(([kind, n]) => `${n} ${KIND_WORDS[kind] ?? kind}`);
		return `${code(prompt)}: ${parts.length > 0 ? parts.join(', ') : 'none'}`;
	});
	items.push(`<strong>Why runs failed.</strong> ${failureLine.join('. ')}.`);

	// 7. Valid, but a level does not load.
	const valid = validOf(runs);
	const unloadable = valid.filter(
		(run) => run.m.semantic?.loads === false || run.m.concept?.loads === false
	);
	items.push(
		`<strong>Valid, but not loadable:</strong> ${unloadable.length} of ${valid.length} valid zooms (${pct(unloadable.length, valid.length)}) have a level that does not load into a Blockly workspace. The proxy’s checks passed them.`
	);

	// 8. Cost and time.
	const costs = models.map((model) => {
		const list = runs.filter((run) => run.model === model);
		return {
			model,
			cost: sum(list.map((run) => run.m.costUsd ?? 0)),
			seconds: mean(list.map((run) => run.m.totalSeconds))
		};
	});
	if (runs.some((run) => run.m.costUsd !== undefined)) {
		const total = sum(costs.map((c) => c.cost));
		const dear = [...costs].sort((x, y) => y.cost - x.cost)[0];
		const slow = [...costs].sort((x, y) => y.seconds - x.seconds)[0];
		const quick = [...costs].sort((x, y) => x.seconds - y.seconds)[0];
		if (dear && slow && quick) {
			items.push(
				`<strong>Cost and time.</strong> The recorded cost of all ${runs.length} runs is $${total.toFixed(2)}; ${esc(nameOf(file, dear.model))} was the most expensive at $${dear.cost.toFixed(2)}. The slowest model took ${fmt(Math.round(slow.seconds))} seconds per run on average (${esc(nameOf(file, slow.model))}), the fastest ${fmt(Math.round(quick.seconds))} (${esc(nameOf(file, quick.model))}).`
			);
		}
	}

	// 9. The same text, counted differently.
	const bySame = new Map<string, Run[]>();
	for (const run of runs) {
		if (run.input === undefined) continue;
		const key = `${run.program}|${run.prompt}`;
		bySame.set(key, [...(bySame.get(key) ?? []), run]);
	}
	const spreads = [...bySame.values()]
		.filter((list) => list.length >= 3)
		.map((list) => {
			const sorted = [...list].sort((x, y) => (x.input ?? 0) - (y.input ?? 0));
			const low = sorted[0];
			const high = sorted[sorted.length - 1];
			return { ratio: (high?.input ?? 1) / (low?.input ?? 1), highest: high?.model };
		});
	if (spreads.length > 0) {
		const tally = new Map<string, number>();
		for (const spread of spreads)
			if (spread.highest) tally.set(spread.highest, (tally.get(spread.highest) ?? 0) + 1);
		const top = [...tally].sort((x, y) => y[1] - x[1])[0];
		items.push(
			`<strong>Input tokens.</strong> The text sent for one program and prompt is identical for every model, yet the providers counted it differently: the largest count was ${median(spreads.map((s) => s.ratio)).toFixed(2)} times the smallest at the median over ${spreads.length} program and prompt pairs (at most ${Math.max(...spreads.map((s) => s.ratio)).toFixed(2)} times)${top ? `, and ${esc(nameOf(file, top[0]))} counted the most in ${top[1]} of them` : ''}. Token counts are comparable between programs and prompts for one model, not across models.`
		);
	}

	return `<p class="lead">Computed from the runs on this page: counts and comparisons, not judgments about quality. “Valid” means the output passed the checks, not that the abstraction is good. The write-up beside the results file has the interpretation and the limits.</p><ul class="findings">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------------------

/** One cell of the prompt-effect table: the two values and the change, with an arrow and a word. */
function delta(
	from: number,
	to: number,
	kind: 'points' | 'percent',
	better: 'higher' | 'lower',
	show: (value: number) => string
): string {
	const change = kind === 'points' ? to - from : from === 0 ? NaN : ((to - from) / from) * 100;
	const flat = kind === 'points' ? Math.abs(change) < 2 : Math.abs(change) < 5;
	const text = Number.isNaN(change)
		? 'n/a'
		: `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(Math.round(change))}${kind === 'points' ? ' pts' : '%'}`;
	const direction = flat ? 'flat' : change > 0 === (better === 'higher') ? 'good' : 'bad';
	const word = flat ? 'about the same' : direction === 'good' ? 'better' : 'worse';
	const arrow = flat || Number.isNaN(change) ? '≈' : change > 0 ? '▲' : '▼';
	return `<span class="was">${esc(show(from))} → ${esc(show(to))}</span><span class="delta ${direction}" title="${esc(word)}"><span aria-hidden="true">${arrow}</span> ${esc(text)}<span class="sr"> (${word})</span></span>`;
}

/** The effect of the second prompt against the first, per model: validity, first try, concept count, tokens, cost and time. */
export function promptEffect(file: BaselineFile, scored: Scored): string {
	const runs = runsOf(scored);
	const prompts = [...new Set(runs.map((run) => run.prompt))].sort();
	const [base, other] = prompts;
	if (base === undefined || other === undefined) {
		return '<p>Needs two prompts to compare.</p>';
	}
	const stats = (list: Run[]) => {
		const valid = list.filter((run) => run.m.valid);
		return {
			valid: (100 * valid.length) / list.length,
			first: (100 * list.filter((run) => run.m.validFirstAttempt).length) / list.length,
			range:
				valid.length === 0
					? NaN
					: (100 * valid.filter((run) => run.m.conceptCountInRange).length) / valid.length,
			tokens: mean(list.map((run) => run.m.completionTokens)),
			cost: mean(list.map((run) => run.m.costUsd ?? 0)),
			seconds: mean(list.map((run) => run.m.totalSeconds)),
			// Pooled over the valid zooms' blocks, not a mean of per-run shares. NaN when there are none.
			anchored: pooled(
				valid,
				(m) => m.anchors?.semantic.named,
				(m) => m.anchors?.semantic.zoomBlocks
			),
			resolved: pooled(
				valid,
				(m) => m.anchors?.semantic.resolved,
				(m) => m.anchors?.semantic.named
			),
			flagged: pooled(
				valid,
				(m) => m.anchorChecks?.flagged,
				(m) => m.anchorChecks?.checked
			)
		};
	};
	const rowFor = (label: string, a: Run[], b: Run[]): { html: string; order: number } => {
		const x = stats(a);
		const y = stats(b);
		const percent = (value: number): string => `${Math.round(value)}%`;
		const anchor = (from: number, to: number, better: 'higher' | 'lower'): string =>
			Number.isNaN(to)
				? '<span class="was">n/a</span>'
				: Number.isNaN(from)
					? `<span class="was">n/a → ${esc(percent(to))}</span>`
					: delta(from, to, 'points', better, percent);
		const cells = [
			delta(x.valid, y.valid, 'points', 'higher', percent),
			delta(x.first, y.first, 'points', 'higher', percent),
			Number.isNaN(x.range) || Number.isNaN(y.range)
				? '<span class="was">n/a</span>'
				: delta(x.range, y.range, 'points', 'higher', percent),
			delta(x.tokens, y.tokens, 'percent', 'lower', (v) => fmt(Math.round(v))),
			delta(x.cost, y.cost, 'percent', 'lower', (v) => `$${v.toFixed(4)}`),
			delta(x.seconds, y.seconds, 'percent', 'lower', (v) => `${Math.round(v)} s`),
			anchor(x.anchored, y.anchored, 'higher'),
			anchor(x.resolved, y.resolved, 'higher'),
			anchor(x.flagged, y.flagged, 'lower')
		];
		return {
			order: y.valid - x.valid,
			html: `<tr><th scope="row">${label}</th>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
		};
	};

	const models = [...new Set(runs.map((run) => run.model))];
	const rows = models
		.map((model) => {
			const via = viaOf(file, model);
			return rowFor(
				`${esc(nameOf(file, model))}${via ? `<span class="via-line">${esc(via)}</span>` : ''}`,
				runs.filter((run) => run.model === model && run.prompt === base),
				runs.filter((run) => run.model === model && run.prompt === other)
			);
		})
		.sort((x, y) => y.order - x.order);
	const all = rowFor(
		'<strong>All models</strong>',
		runs.filter((run) => run.prompt === base),
		runs.filter((run) => run.prompt === other)
	);

	return `<p class="lead">Each cell is the value with ${code(base)}, then with ${code(other)}, and the change. Sorted by the change in valid runs, biggest gain first. “Concept count in range” is among valid zooms only. ▲ and ▼ say the number went up or down; the word (better, worse, about the same) says whether that is an improvement. Differences of 2 points or 5% or less count as about the same. The last three columns are about colour: they pool the Semantic blocks of the valid zooms (the charts below average each run’s own share, so they differ a little), “n/a” means that prompt has no covers or no checks, and D24a flags are candidates for labels, not verdicts.</p><div class="table-wrap"><table class="effect"><thead><tr><th scope="col">Model</th><th scope="col">Valid runs</th><th scope="col">Valid on the first attempt</th><th scope="col">Concept count in range</th><th scope="col">Output tokens per run</th><th scope="col">Cost per run</th><th scope="col">Seconds per run</th><th scope="col">Semantic blocks with an anchor (D23)</th><th scope="col">Anchors that are Detail blocks (D23)</th><th scope="col">Anchors flagged (D24a)</th></tr></thead><tbody>${rows.map((row) => row.html).join('')}${all.html}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------

/** One row per program (smallest first), one column per model, the result for each prompt in the cell. */
export function programGrid(file: BaselineFile, scored: Scored): string {
	const runs = runsOf(scored);
	const prompts = [...new Set(runs.map((run) => run.prompt))].sort();
	const models = [...new Set(runs.map((run) => run.model))];
	const programs = [...new Set(runs.map((run) => run.program))]
		.map((id) => {
			try {
				return findProgram(id);
			} catch {
				return undefined;
			}
		})
		.filter((program): program is NonNullable<typeof program> => program !== undefined)
		.sort((x, y) => x.blocks - y.blocks);

	const head = models
		.map((model) => {
			const via = viaOf(file, model);
			return `<th scope="col" class="mcol" title="${esc(`${nameOf(file, model)}${via ? ` (${via})` : ''}`)}"><span>${esc(nameOf(file, model))}</span></th>`;
		})
		.join('');

	const body = programs
		.map((program) => {
			const cells = models
				.map((model) => {
					const marks = prompts.map((prompt) => {
						const run = runs.find(
							(candidate) =>
								candidate.model === model &&
								candidate.prompt === prompt &&
								candidate.program === program.id
						);
						if (!run) return `<span class="pc">${esc(prompt)} —</span>`;
						if (!run.m.valid) {
							const kind = run.m.failure ?? 'other';
							return `<span class="pc bad" title="${esc(`${prompt}: failed, ${KIND_WORDS[kind] ?? kind}`)}">${esc(prompt)} ✕ ${esc(SHORT_KIND[kind] ?? kind)}</span>`;
						}
						const count = run.m.conceptCount ?? 0;
						const [min, max] = program.expectedConcepts;
						const outside = count < min || count > max;
						const unloadable = run.m.semantic?.loads === false || run.m.concept?.loads === false;
						const note = [
							outside ? 'outside the expected range' : '',
							unloadable ? 'does not load' : ''
						]
							.filter(Boolean)
							.join(', ');
						return `<span class="pc ${outside || unloadable ? 'warn' : 'ok'}" title="${esc(`${prompt}: valid, ${count} concept${count === 1 ? '' : 's'}${note ? `, ${note}` : ''}`)}">${esc(prompt)} ✓ ${count}${outside ? ' ⚠' : ''}${unloadable ? ' ⛔' : ''}</span>`;
					});
					return `<td>${marks.join('')}</td>`;
				})
				.join('');
			const [min, max] = program.expectedConcepts;
			return `<tr><th scope="row"><span class="pname">${esc(program.title)}</span><span class="via-line">${esc(program.tier)} · ${program.blocks} blocks · ${program.topLevelStacks} stack${program.topLevelStacks === 1 ? '' : 's'} · expect ${min === max ? min : `${min}–${max}`}</span></th>${cells}</tr>`;
		})
		.join('');

	return `<p class="lead">One row per program, smallest first; one column per model; each cell shows ${prompts.map(code).join(' and ')}. <strong>✓ n</strong> is a valid zoom with n concepts, <strong>⚠</strong> marks a count outside the range the corpus author expected (provisional), <strong>⛔</strong> a level that does not load, and <strong>✕</strong> a failed run: <em>JSON</em> not valid JSON, <em>schema</em> the wrong shape, <em>detail</em> did not fit the Detail program, <em>cap</em> cut off at the output cap, <em>time</em> timed out. Hover a cell for the words.</p><div class="table-wrap"><table class="grid-table"><thead><tr><th scope="col">Program</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------

/** What each measure means, from the same catalog the charts use. */
export function glossary(): string {
	const rows = Object.values(BASELINE_METRICS)
		.filter((info) => info.about)
		.map(
			(info) =>
				`<tr><th scope="row">${esc(info.label)}</th><td>${info.code ? esc(info.code) : ''}</td><td>${info.better === 'higher' ? '↑ higher' : info.better === 'lower' ? '↓ lower' : '—'}</td><td>${esc(info.about ?? '')}</td></tr>`
		)
		.join('');
	return `<p class="lead">Bars average over the runs behind them. A share (valid runs and the like) is the mean of 1 or 0 per run, shown as a percentage. Every number is scored again from the stored model text each time this page is made, with the validators as they are now. The ids (D1, D5, …) are the metrics of section 9.4 of the plan.</p><div class="table-wrap"><table><thead><tr><th scope="col">Measure</th><th scope="col">Plan id</th><th scope="col">Better</th><th scope="col">What it shows</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
