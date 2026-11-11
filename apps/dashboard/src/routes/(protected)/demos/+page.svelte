<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '#lib/components/DataTable.svelte';
	import { DEMO_KINDS, DEMO_LABELS, type DemoView } from '#lib/schemas/demo.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

	const columns = [
		{ key: 'title', header: 'Title', sortValue: (demo: DemoView) => demo.title },
		{ key: 'description', header: 'Description' },
		{ key: 'kind', header: 'Demo', sortValue: (demo: DemoView) => DEMO_LABELS[demo.demoKind] },
		{ key: 'created', header: 'Created', sortValue: (demo: DemoView) => demo.createdAt }
	];
	const filters = [
		{
			key: 'kind',
			label: 'Filter by demo',
			allLabel: 'All demos',
			get: (demo: DemoView) => demo.demoKind,
			options: DEMO_KINDS.map((kind) => ({ value: kind, label: DEMO_LABELS[kind] }))
		}
	];
</script>

<div class="flex items-center justify-between gap-4">
	<h1 class="h1">Demos</h1>
	<a class="btn preset-filled" href={resolve('/(protected)/demos/new')}>
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
		>
			<path d="M12 5v14M5 12h14" />
		</svg>
		<span>New demo</span>
	</a>
</div>

{#if data.deleted}
	<p class="card preset-tonal-success mt-4 p-3" role="status">Demo deleted.</p>
{/if}

<section class="mt-6">
	<DataTable
		rows={data.demos}
		label="Demos"
		{columns}
		rowKey={(demo) => demo.id}
		haystack={(demo) => `${demo.title} ${demo.description ?? ''}`}
		searchLabel="Search demos"
		{filters}
	>
		{#snippet row(demo)}
			<td class="font-bold">
				<a
					class="anchor after:absolute after:inset-0"
					href={resolve('/(protected)/demos/[id]', { id: demo.id })}>{demo.title}</a
				>
			</td>
			<td class="max-w-md"><p class="line-clamp-2 break-words">{demo.description ?? ''}</p></td>
			<td><span class="badge preset-tonal">{DEMO_LABELS[demo.demoKind]}</span></td>
			<td class="whitespace-nowrap">{dateFormat.format(demo.createdAt)}</td>
		{/snippet}
		{#snippet empty()}
			<div class="card preset-outlined-surface-200-800 p-8 text-center">
				<p class="mb-4">No demos yet.</p>
				<a class="btn preset-tonal" href={resolve('/(protected)/demos/new')}
					>Create your first demo</a
				>
			</div>
		{/snippet}
	</DataTable>
</section>
