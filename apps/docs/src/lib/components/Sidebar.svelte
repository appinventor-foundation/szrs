<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { NavNode } from '#lib/nav.js';

	const { nav, currentSlug }: { nav: NavNode; currentSlug: string } = $props();

	// The site uses trailingSlash: 'always', but resolve() doesn't add the slash itself.
	function pageUrl(slug: string): string {
		const url = resolve('/[...slug]', { slug });
		return url.endsWith('/') ? url : `${url}/`;
	}
</script>

{#snippet link(node: NavNode)}
	<a
		href={pageUrl(node.slug ?? '')}
		aria-current={node.slug === currentSlug ? 'page' : undefined}
		class={[
			'block rounded-base px-2 py-1',
			node.slug === currentSlug ? 'preset-tonal-primary font-semibold' : 'hover:bg-surface-100-900'
		]}>{node.title}</a
	>
{/snippet}

{#snippet item(node: NavNode)}
	<li class="my-0.5">
		{#if node.slug !== null}
			{@render link(node)}
		{:else}
			<span class="mt-2.5 block px-2 py-1 text-xs tracking-wider text-surface-800-200 uppercase"
				>{node.title}</span
			>
		{/if}
		{#if node.children.length > 0}
			<ul class="ml-3 border-l border-surface-200-800 pl-2.5">
				{#each node.children as child (child.slug ?? child.title)}
					{@render item(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<nav aria-label="Documentation">
	<ul>
		{#if nav.slug !== null}
			<li class="my-0.5">{@render link(nav)}</li>
		{/if}
		{#each nav.children as child (child.slug ?? child.title)}
			{@render item(child)}
		{/each}
	</ul>
</nav>
