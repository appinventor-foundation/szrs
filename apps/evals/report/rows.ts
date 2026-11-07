// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * What the viewer draws. A results file is turned into this by an adapter (see
 * spike.ts), so the renderer knows nothing about any one check. The baseline
 * will add an adapter that maps its records (one per program, prompt, model and
 * sample) to rows.
 */
export interface ResultRow {
	/** The model, by its own name ("glm-5.3-flash"), not the alias it is served under. Rows are grouped by it. */
	model: string;
	/** The service the request goes to ("openrouter"). Shown beside the model. */
	provider?: string;
	/** The maker, when the provider routes to several ("z-ai"). */
	vendor?: string;
	/** The name of the model in the proxy's config. Only a hint: the model is what matters. */
	alias?: string;
	/** The prompt id. It is the series: one colour per prompt, stable across charts. */
	prompt: string;
	/** A size tier (S, M, L, ...). Rows of different tiers are drawn in separate panels. */
	tier?: string;
	program?: string;
	sample?: number;
	/** Numbers to chart. Every key present in any row gets a chart. */
	metrics: Record<string, number | undefined>;
	/** Text for the table view and the detail list, not charted. */
	facts?: Record<string, string>;
	/** What the detail list shows for this row. Never trusted: it is escaped. */
	detail?: { plan?: unknown; rawText?: string; error?: string };
}

/** A block of HTML an adapter built itself (a table of what a check found), already escaped. */
export interface ReportSection {
	title: string;
	description?: string;
	html: string;
	/** Whether the section starts expanded (default true). */
	open?: boolean;
	/** `after` puts it below the charts and the outputs' heading, for reference material (default: before the charts). */
	placement?: 'before' | 'after';
}

/** What a charted number means, so a chart can say what it shows and which way is better. */
export interface MetricInfo {
	label: string;
	/** One sentence: what it counts or measures. */
	about?: string;
	unit?: string;
	/** `rate`: 1 or 0 per run, charted as a percentage of runs. */
	kind?: 'rate';
	/** Which direction is an improvement; leave out when neither is. */
	better?: 'higher' | 'lower';
	/** The plan's metric id (D1, D5, ...), for the glossary. */
	code?: string;
	/** Decimal places shown; default is none above 100 and one below. */
	decimals?: number;
}

/** Charts that belong together, drawn under one collapsible heading. */
export interface MetricGroup {
	title: string;
	description?: string;
	keys: string[];
}

export interface Report {
	title: string;
	subtitle?: string;
	rows: ResultRow[];
	/** Shown before the charts (or after them, see `placement`). */
	sections: ReportSection[];
	/** What each charted number means. A number with no entry is labelled with its key. */
	metrics?: Record<string, MetricInfo>;
	/** How to group the charts. Without it they share one group. */
	chartGroups?: MetricGroup[];
}

/** "z-ai via openrouter", "openai": where a model comes from, for the secondary text beside its name. */
export function modelVia(row: Pick<ResultRow, 'provider' | 'vendor'>): string {
	if (row.vendor && row.provider) return `${row.vendor} via ${row.provider}`;
	return row.provider ?? row.vendor ?? '';
}

/** What makes two rows the same model: its name, maker and provider. */
export function modelKey(row: Pick<ResultRow, 'model' | 'provider' | 'vendor'>): string {
	return [row.model, row.vendor ?? '', row.provider ?? ''].join('\u0000');
}
