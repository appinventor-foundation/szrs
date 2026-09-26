<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { NavNode } from '$lib/nav';

	const { nav, currentSlug }: { nav: NavNode; currentSlug: string } = $props();

	// The site uses trailingSlash: 'always', but resolve() doesn't add the slash itself.
	function pageUrl(slug: string): string {
		const url = resolve('/[...slug]', { slug });
		return url.endsWith('/') ? url : `${url}/`;
	}
</script>

{#snippet link(node: NavNode)}
	<a href={pageUrl(node.slug ?? '')} aria-current={node.slug === currentSlug ? 'page' : undefined}
		>{node.title}</a
	>
{/snippet}

{#snippet item(node: NavNode)}
	<li>
		{#if node.slug !== null}
			{@render link(node)}
		{:else}
			<span class="section">{node.title}</span>
		{/if}
		{#if node.children.length > 0}
			<ul>
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
			<li>{@render link(nav)}</li>
		{/if}
		{#each nav.children as child (child.slug ?? child.title)}
			{@render item(child)}
		{/each}
	</ul>
</nav>

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	ul ul {
		margin-left: 0.8rem;
		padding-left: 0.6rem;
		border-left: 1px solid var(--border);
	}

	li {
		margin: 0.15rem 0;
	}

	a,
	.section {
		display: block;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	a {
		color: var(--fg);
		text-decoration: none;
	}

	a:hover {
		background: var(--code-bg);
	}

	a[aria-current='page'] {
		background: var(--accent-bg);
		color: var(--accent);
		font-weight: 600;
	}

	.section {
		margin-top: 0.6rem;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
</style>
