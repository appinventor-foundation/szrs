<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import EmbeddedPage from '#lib/components/EmbeddedPage.svelte';
	import DemoRunner from '#lib/components/DemoRunner.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<Breadcrumbs
	items={[
		{ label: 'Demos', href: resolve('/(protected)/demos') },
		{ label: data.demo.title, href: resolve('/(protected)/demos/[id]', { id: data.demo.id }) },
		{ label: 'Run' }
	]}
/>

<h1 class="h1 min-w-0 break-words">{data.demo.title}</h1>

<div class="mt-6">
	{#if data.kind === 'iframe'}
		<EmbeddedPage url={data.url} title={data.demo.title} />
	{:else}
		<DemoRunner
			demoId={data.demo.id}
			workspace={data.workspace}
			source={data.source}
			canSetStarter={data.canSetStarter}
			model={data.model}
		/>
	{/if}
</div>
