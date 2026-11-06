// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { asNumber, esc, fmt, isRecord } from './html.js';
import { modelVia, type Report, type ResultRow } from './rows.js';

/**
 * Reads the JSON that cap-and-temperature-spike.ts writes. Returns undefined
 * when the file is not that kind of result.
 */
export function spikeReport(json: unknown): Report | undefined {
	if (!isRecord(json) || !Array.isArray(json.aliases)) return undefined;
	const aliases = json.aliases.filter((alias): alias is string => typeof alias === 'string');

	const rows: ResultRow[] = [];
	for (const alias of aliases) {
		const perAlias = json[alias];
		const zooms = isRecord(perAlias) && isRecord(perAlias.zooms) ? perAlias.zooms : {};
		for (const [prompt, zoom] of Object.entries(zooms)) {
			if (isRecord(zoom)) rows.push(zoomRow(identity(json, alias), prompt, zoom));
		}
	}

	const program = isRecord(json.program) ? json.program : {};
	const ranAt = typeof json.ranAt === 'string' ? json.ranAt : undefined;
	return {
		title: 'Cap and temperature spike',
		subtitle: [
			ranAt && `Run ${ranAt}`,
			asNumber(program.blocks) !== undefined &&
				`one ${program.blocks}-block, ${program.topLevelStacks}-stack program`,
			`${aliases.length} model${aliases.length === 1 ? '' : 's'}`
		]
			.filter(Boolean)
			.join(' · '),
		rows,
		sections: [
			{
				title: 'What each model accepts',
				description:
					'A request-time check: temperature 0.2, and larger output caps with a tiny prompt. A cap is accepted when the provider answers 200.',
				html: acceptanceTable(json, aliases)
			}
		]
	};
}

type Identity = Pick<ResultRow, 'model' | 'provider' | 'vendor' | 'alias'>;

// The model an alias resolved to, as the run recorded it. A result without that
// record can only show the alias.
function identity(json: Record<string, unknown>, alias: string): Identity {
	const models = isRecord(json.models) ? json.models : {};
	const found = models[alias];
	if (!isRecord(found) || typeof found.model !== 'string') return { model: alias, alias };
	return {
		model: found.model,
		provider: typeof found.provider === 'string' ? found.provider : undefined,
		vendor: typeof found.vendor === 'string' ? found.vendor : undefined,
		alias
	};
}

function zoomRow(who: Identity, prompt: string, zoom: Record<string, unknown>): ResultRow {
	const usage = isRecord(zoom.usage) ? zoom.usage : {};
	const maxTokens = asNumber(zoom.maxTokens);
	const completion = asNumber(usage.completionTokens);
	const seconds = (ms: unknown): number | undefined => {
		const value = asNumber(ms);
		return value === undefined ? undefined : Math.round(value / 100) / 10;
	};
	const facts: Record<string, string> = {};
	for (const key of ['outcome', 'finishReason'] as const) {
		if (typeof zoom[key] === 'string') facts[key] = zoom[key];
	}
	if (maxTokens !== undefined) facts.cap = `${fmt(maxTokens)} tokens`;
	if (Array.isArray(zoom.repairs)) facts.repairs = String(zoom.repairs.length);

	return {
		...who,
		prompt,
		metrics: {
			promptTokens: asNumber(usage.promptTokens),
			completionTokens: completion,
			capUsedPercent:
				completion !== undefined && maxTokens
					? Math.round((completion / maxTokens) * 100)
					: undefined,
			firstTokenSeconds: seconds(zoom.firstTokenMs),
			totalSeconds: seconds(zoom.totalMs),
			semanticTopBlocks: asNumber(zoom.semanticTopBlocks),
			conceptTopBlocks: asNumber(zoom.conceptTopBlocks),
			bindings: asNumber(zoom.bindings)
		},
		facts,
		detail: {
			plan: zoom.plan,
			rawText: typeof zoom.rawText === 'string' ? zoom.rawText : undefined,
			error: typeof zoom.error === 'string' ? zoom.error : undefined
		}
	};
}

// An accepted setting gets a check, a rejected one a cross: the mark and the word
// carry the state, never the colour alone.
function chip(accepted: boolean, text: string, title?: string): string {
	return `<span class="chip ${accepted ? 'ok' : 'bad'}"${title ? ` title="${esc(title)}"` : ''}><span aria-hidden="true">${accepted ? '✓' : '✕'}</span> ${esc(text)}<span class="sr"> ${accepted ? 'accepted' : 'rejected'}</span></span>`;
}

function acceptanceTable(json: Record<string, unknown>, aliases: string[]): string {
	const rows = aliases.map((alias) => {
		const perAlias = isRecord(json[alias]) ? json[alias] : {};
		const temperature = isRecord(perAlias.temperature) ? perAlias.temperature : {};
		const accepted = isRecord(temperature.accepted) ? temperature.accepted : {};
		const caps = isRecord(perAlias.capAcceptance) ? perAlias.capAcceptance : {};
		const honoured = isRecord(perAlias.capHonoured) ? perAlias.capHonoured : {};

		const tempOk = accepted.status === 200;
		const capChips = Object.entries(caps)
			.map(([cap, result]) => {
				const status = isRecord(result) ? result.status : undefined;
				const error =
					isRecord(result) && typeof result.error === 'string' ? result.error : undefined;
				return chip(status === 200, fmt(Number(cap)), error);
			})
			.join(' ');

		const usage = isRecord(honoured.usage) ? honoured.usage : {};
		const details = isRecord(usage.completion_tokens_details)
			? usage.completion_tokens_details
			: {};
		const completion = asNumber(usage.completion_tokens);
		const reasoning = asNumber(details.reasoning_tokens);
		const stopped =
			typeof honoured.finishReason === 'string' ? `stopped: ${honoured.finishReason}` : 'no answer';
		const reasoningText =
			completion && reasoning !== undefined
				? `${fmt(Math.min(100, Math.round((reasoning / completion) * 100)))}% of ${fmt(completion)} output tokens were reasoning (${stopped})`
				: stopped;

		const who = identity(json, alias);
		const via = [modelVia(who), who.model === alias ? '' : `alias ${alias}`]
			.filter(Boolean)
			.join(' · ');
		return `<tr><th scope="row">${esc(who.model)}${via ? `<span class="via-line">${esc(via)}</span>` : ''}</th><td>${chip(tempOk, '0.2', typeof accepted.error === 'string' ? accepted.error : undefined)}</td><td class="chips">${capChips}</td><td>${esc(reasoningText)}</td></tr>`;
	});

	return `<div class="table-wrap"><table><thead><tr><th scope="col">Model</th><th scope="col">Temperature</th><th scope="col">Output caps</th><th scope="col">Cap of 256 tokens, long answer</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
