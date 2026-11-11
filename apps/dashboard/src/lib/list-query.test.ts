// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it } from 'vitest';
import { isFiltered, matchesSearch, nextSort, queryRows, sortRows } from './list-query.js';

type Row = { name: string; role: string; age: number | null; at: Date };

const rows: Row[] = [
	{ name: 'beta', role: 'user', age: 30, at: new Date('2026-03-01') },
	{ name: 'Alpha', role: 'admin', age: null, at: new Date('2026-01-01') },
	{ name: 'item 10', role: 'user', age: 5, at: new Date('2026-02-01') },
	{ name: 'item 9', role: 'admin', age: 7, at: new Date('2026-04-01') }
];
const names = (list: Row[]) => list.map((row) => row.name);

describe('nextSort', () => {
	it('cycles ascending, descending, then back to the original order', () => {
		const first = nextSort(undefined, 'name');
		expect(first).toEqual({ key: 'name', direction: 'asc' });
		const second = nextSort(first, 'name');
		expect(second).toEqual({ key: 'name', direction: 'desc' });
		expect(nextSort(second, 'name')).toBeUndefined();
	});

	it('starts ascending when another column is chosen', () => {
		expect(nextSort({ key: 'name', direction: 'desc' }, 'role')).toEqual({
			key: 'role',
			direction: 'asc'
		});
	});
});

describe('sortRows', () => {
	it('sorts text ignoring case and reading numbers as numbers', () => {
		expect(names(sortRows(rows, (r) => r.name, 'asc'))).toEqual([
			'Alpha',
			'beta',
			'item 9',
			'item 10'
		]);
	});

	it('sorts dates and numbers, and reverses', () => {
		expect(names(sortRows(rows, (r) => r.at, 'desc'))).toEqual([
			'item 9',
			'beta',
			'item 10',
			'Alpha'
		]);
		expect(names(sortRows(rows, (r) => r.age, 'asc'))).toEqual([
			'item 10',
			'item 9',
			'beta',
			'Alpha'
		]);
	});

	it('puts missing values last in both directions', () => {
		expect(names(sortRows(rows, (r) => r.age, 'desc')).at(-1)).toBe('Alpha');
		expect(names(sortRows(rows, (r) => r.age, 'asc')).at(-1)).toBe('Alpha');
	});

	it('keeps the original order of ties and does not change its input', () => {
		const before = names(rows);
		expect(names(sortRows(rows, (r) => r.role, 'asc'))).toEqual([
			'Alpha',
			'item 9',
			'beta',
			'item 10'
		]);
		expect(names(rows)).toEqual(before);
	});

	it('sorts booleans with false first', () => {
		const flags = [{ f: true }, { f: false }];
		expect(sortRows(flags, (r) => r.f, 'asc')).toEqual([{ f: false }, { f: true }]);
	});
});

describe('matchesSearch', () => {
	it('matches every word, in any order, ignoring case', () => {
		expect(matchesSearch('Alpha admin', 'ADMIN alp')).toBe(true);
		expect(matchesSearch('Alpha admin', 'alpha user')).toBe(false);
	});

	it('matches everything for blank text', () => {
		expect(matchesSearch('anything', '   ')).toBe(true);
	});
});

describe('queryRows', () => {
	const base = { text: '', haystack: (r: Row) => `${r.name} ${r.role}`, filters: [] };
	const byRole = (value: string) => ({ get: (r: Row) => r.role, value });

	it('returns every row, in order, when nothing is asked', () => {
		expect(names(queryRows(rows, base))).toEqual(names(rows));
	});

	it('searches, filters, and sorts together', () => {
		const result = queryRows(rows, {
			...base,
			text: 'item',
			filters: [byRole('admin')],
			sort: { value: (r) => r.name, direction: 'asc' }
		});
		expect(names(result)).toEqual(['item 9']);
	});

	it('treats an empty filter value as any', () => {
		expect(queryRows(rows, { ...base, filters: [byRole('')] })).toHaveLength(4);
	});

	it('combines filters with and', () => {
		const filters = [byRole('user'), { get: (r: Row) => r.name, value: 'beta' }];
		expect(names(queryRows(rows, { ...base, filters }))).toEqual(['beta']);
	});
});

describe('isFiltered', () => {
	it('is true for text or a chosen filter only', () => {
		const get = (r: Row) => r.role;
		expect(isFiltered({ text: ' ', filters: [{ get, value: '' }] })).toBe(false);
		expect(isFiltered({ text: 'a', filters: [] })).toBe(true);
		expect(isFiltered({ text: '', filters: [{ get, value: 'admin' }] })).toBe(true);
	});
});
