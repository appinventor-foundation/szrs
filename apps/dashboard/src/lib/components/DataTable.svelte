<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { isFiltered, nextSort, queryRows, type Sort, type SortValue } from '#lib/list-query.js';

	type Column = {
		key: string;
		header: string;
		// A column with a value to sort by gets a sortable header.
		sortValue?: (row: T) => SortValue;
	};
	type Filter = {
		key: string;
		// The accessible name of the dropdown.
		label: string;
		// The dropdown's first choice, which shows every row.
		allLabel: string;
		get: (row: T) => string;
		options: { value: string; label: string }[];
	};
	type Props = {
		rows: T[];
		// The table's accessible name.
		label: string;
		columns: Column[];
		// The cells of one row. The first cell holds the row's link, which is
		// stretched over the whole row.
		row: Snippet<[T]>;
		rowKey: (row: T) => string;
		// The text a search looks through.
		haystack: (row: T) => string;
		searchLabel: string;
		filters?: Filter[];
		// Shown instead of the table when there are no rows at all.
		empty?: Snippet;
	};

	const {
		rows,
		label,
		columns,
		row,
		rowKey,
		haystack,
		searchLabel,
		filters = [],
		empty
	}: Props = $props();

	let text = $state('');
	let chosen = $state<Record<string, string>>({});
	let sort = $state<Sort>();

	const query = $derived({
		text,
		haystack,
		filters: filters.map((filter) => ({ get: filter.get, value: chosen[filter.key] ?? '' })),
		sort: sortFor(sort)
	});
	const shown = $derived(queryRows(rows, query));
	const filtered = $derived(isFiltered(query));

	function sortFor(current: Sort | undefined) {
		const value = columns.find((column) => column.key === current?.key)?.sortValue;
		return current && value ? { value, direction: current.direction } : undefined;
	}

	function ariaSort(key: string) {
		if (sort?.key !== key) return 'none';
		return sort.direction === 'asc' ? 'ascending' : 'descending';
	}

	function clear() {
		text = '';
		chosen = {};
	}
</script>

{#if rows.length === 0 && empty}
	{@render empty()}
{:else}
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<input
			class="input max-w-xs"
			type="search"
			placeholder="Search"
			aria-label={searchLabel}
			data-testid="list-search"
			bind:value={text}
		/>
		{#each filters as filter (filter.key)}
			<select
				class="select w-auto"
				aria-label={filter.label}
				data-testid="list-filter-{filter.key}"
				value={chosen[filter.key] ?? ''}
				onchange={(event) => (chosen[filter.key] = event.currentTarget.value)}
			>
				<option value="">{filter.allLabel}</option>
				{#each filter.options as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		{/each}
		<p class="text-sm opacity-80" aria-live="polite" data-testid="list-count">
			{shown.length} of {rows.length}
		</p>
	</div>

	{#if shown.length === 0}
		<div class="card preset-outlined-surface-200-800 p-8 text-center" data-testid="list-no-results">
			<p class="mb-4">No results.</p>
			{#if filtered}
				<button type="button" class="btn preset-tonal" data-testid="list-clear" onclick={clear}
					>Clear filters</button
				>
			{/if}
		</div>
	{:else}
		<div class="table-wrap">
			<table class="table" aria-label={label}>
				<thead>
					<tr>
						{#each columns as column (column.key)}
							<th scope="col" aria-sort={column.sortValue ? ariaSort(column.key) : undefined}>
								{#if column.sortValue}
									<button
										type="button"
										class="inline-flex items-center gap-1 font-bold"
										data-testid="sort-{column.key}"
										onclick={() => (sort = nextSort(sort, column.key))}
									>
										{column.header}
										<span aria-hidden="true" class:opacity-40={sort?.key !== column.key}>
											{sort?.key !== column.key ? '↕' : sort.direction === 'asc' ? '▲' : '▼'}
										</span>
									</button>
								{:else}
									{column.header}
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each shown as item (rowKey(item))}
						<tr class="hover:preset-tonal relative" data-testid="list-row">{@render row(item)}</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}
