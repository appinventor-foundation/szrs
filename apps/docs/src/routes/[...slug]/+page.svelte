<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import Toc from '$lib/components/Toc.svelte';
	import { SITE_NAME } from '$lib/site';

	const { data } = $props();
	const Content = $derived(data.content);
</script>

<svelte:head>
	<title>{data.page.slug ? `${data.page.title} · ${SITE_NAME}` : SITE_NAME}</title>
</svelte:head>

<div class="page">
	<article class="prose">
		<Content />
	</article>
	<Toc headings={data.page.headings} />
</div>

<style>
	.page {
		display: flex;
		gap: 3rem;
		align-items: flex-start;
	}

	.prose {
		flex: 1;
		min-width: 0;
		max-width: 46rem;
		line-height: 1.65;
	}

	.prose :global(h1) {
		margin-top: 0;
	}

	.prose :global(h2) {
		margin-top: 2.2rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid var(--border);
	}

	.prose :global(pre) {
		overflow-x: auto;
		padding: 0.9rem 1rem;
		border-radius: 6px;
		background: var(--code-bg);
	}

	.prose :global(code) {
		font-size: 0.9em;
	}

	.prose :global(:not(pre) > code) {
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: var(--code-bg);
	}

	.prose :global(table) {
		border-collapse: collapse;
	}

	.prose :global(th),
	.prose :global(td) {
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
	}

	.prose :global(img) {
		max-width: 100%;
	}
</style>
