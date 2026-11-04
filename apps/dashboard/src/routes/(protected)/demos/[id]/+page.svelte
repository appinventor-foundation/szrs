<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import { DEMO_LABELS } from '#lib/schemas/demo.js';
	import { describeStarter } from '#lib/samples/index.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	const starterLabel = $derived(describeStarter(data.demo));

	const dateFormat = new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	});
</script>

<Breadcrumbs
	items={[{ label: 'Demos', href: resolve('/(protected)/demos') }, { label: data.demo.title }]}
/>

<div class="flex flex-wrap items-start justify-between gap-4">
	<h1 class="h1 min-w-0 break-words">{data.demo.title}</h1>
	<div class="flex gap-2">
		{#if data.demo.demoKind !== 'none'}
			<a
				class="btn preset-filled"
				href={resolve('/(protected)/demos/[id]/run', { id: data.demo.id })}>Start demo</a
			>
		{/if}
		<a class="btn preset-tonal" href={resolve('/(protected)/demos/[id]/edit', { id: data.demo.id })}
			>Edit</a
		>
	</div>
</div>

<div class="mt-6 max-w-2xl space-y-6">
	<section aria-labelledby="description-heading">
		<h2 id="description-heading" class="h4 mb-2">Description</h2>
		{#if data.demo.description}
			<p class="whitespace-pre-wrap">{data.demo.description}</p>
		{:else}
			<p class="opacity-70">No description.</p>
		{/if}
	</section>

	<dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
		<dt class="font-semibold">Created</dt>
		<dd>{dateFormat.format(data.demo.createdAt)} UTC</dd>
		<dt class="font-semibold">Demo</dt>
		<dd>{DEMO_LABELS[data.demo.demoKind]}</dd>
		{#if data.demo.demoKind === 'plugin'}
			<dt class="font-semibold">Opens with</dt>
			<dd>{starterLabel}</dd>
		{:else if data.demo.demoKind === 'iframe'}
			<dt class="font-semibold">Page</dt>
			<dd class="break-all">{data.demo.iframeUrl}</dd>
		{/if}
		<dt class="font-semibold">Last updated</dt>
		<dd>{dateFormat.format(data.demo.updatedAt)} UTC</dd>
	</dl>

	<section class="card preset-outlined-error-500 p-4">
		<details>
			<summary class="cursor-pointer font-semibold">Delete this demo</summary>
			<form method="POST" action="?/delete" class="mt-3 space-y-3">
				<p>This permanently deletes the demo. It cannot be undone.</p>
				<button class="btn preset-filled-error-500" type="submit">Yes, delete this demo</button>
			</form>
		</details>
	</section>
</div>
