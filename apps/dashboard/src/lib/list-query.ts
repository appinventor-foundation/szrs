// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// Sorting, searching and filtering for the dashboard's lists. Pure functions, so
// the lists work the same wherever the rows come from. Today they run in the
// browser over every row; a server-side version would take the same query.

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | Date | boolean | null | undefined;
export type Sort = { key: string; direction: SortDirection };

export type ListFilter<T> = {
	// What the row has for this filter. An empty `value` means "any".
	get: (row: T) => string;
	value: string;
};

export type ListQuery<T> = {
	text: string;
	// The text a search looks through.
	haystack: (row: T) => string;
	filters: ListFilter<T>[];
	// Without a sort the rows keep the order they came in.
	sort?: { value: (row: T) => SortValue; direction: SortDirection };
};

// Clicking a column cycles ascending, descending, then back to the original order.
export function nextSort(current: Sort | undefined, key: string): Sort | undefined {
	if (current?.key !== key) return { key, direction: 'asc' };
	return current.direction === 'asc' ? { key, direction: 'desc' } : undefined;
}

export function sortRows<T>(
	rows: readonly T[],
	value: (row: T) => SortValue,
	direction: SortDirection
): T[] {
	const sign = direction === 'asc' ? 1 : -1;
	// Array.prototype.sort is stable, so ties keep their original order.
	return [...rows].sort((a, b) => {
		const first = value(a);
		const second = value(b);
		const missing = [first, second].map((v) => v === null || v === undefined);
		// Missing values go last whichever way the column is sorted.
		if (missing[0] || missing[1]) return Number(missing[0]) - Number(missing[1]);
		return sign * compare(first, second);
	});
}

// Every word typed has to appear somewhere in the row, in any order, ignoring case.
export function matchesSearch(haystack: string, text: string): boolean {
	const words = text.toLowerCase().split(/\s+/).filter(Boolean);
	const target = haystack.toLowerCase();
	return words.every((word) => target.includes(word));
}

export function queryRows<T>(rows: readonly T[], query: ListQuery<T>): T[] {
	const active = query.filters.filter((filter) => filter.value !== '');
	const kept = rows.filter(
		(row) =>
			matchesSearch(query.haystack(row), query.text) &&
			active.every((filter) => filter.get(row) === filter.value)
	);
	return query.sort ? sortRows(kept, query.sort.value, query.sort.direction) : kept;
}

export function isFiltered<T>(query: Pick<ListQuery<T>, 'text' | 'filters'>): boolean {
	return query.text.trim() !== '' || query.filters.some((filter) => filter.value !== '');
}

function compare(a: SortValue, b: SortValue): number {
	if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
	return String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
}
