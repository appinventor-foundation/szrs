// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/** Escapes text for HTML. Everything from a results file goes through this: model output is untrusted. */
export function esc(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** A number for people: grouped thousands, at most one decimal. */
export function fmt(value: number): string {
	return Number.isInteger(value)
		? value.toLocaleString('en-US')
		: value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;
