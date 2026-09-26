<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import type { Heading } from '$lib/nav';

	const { headings }: { headings: Heading[] } = $props();
</script>

{#if headings.length > 0}
	<nav class="toc" aria-label="On this page">
		<h2>On this page</h2>
		<ul>
			{#each headings as heading (heading.id)}
				<li class:nested={heading.depth > 2}>
					<a href="#{heading.id}">{heading.text}</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	.toc {
		position: sticky;
		top: 2rem;
		flex: 0 0 13rem;
		font-size: 0.85rem;
	}

	h2 {
		margin: 0 0 0.6rem;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		margin: 0.35rem 0;
	}

	li.nested {
		padding-left: 0.9rem;
	}

	a {
		color: var(--muted);
		text-decoration: none;
	}

	a:hover {
		color: var(--fg);
	}

	@media (max-width: 1100px) {
		.toc {
			display: none;
		}
	}
</style>
