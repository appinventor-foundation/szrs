<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { page } from '$app/state';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { normalizeSlug } from '$lib/nav';

	const { data, children } = $props();
</script>

<div class="layout">
	<aside>
		<Sidebar nav={data.nav} currentSlug={normalizeSlug(page.params.slug ?? '')} />
	</aside>
	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(:root) {
		--fg: #1f2328;
		--muted: #656d76;
		--bg: #ffffff;
		--border: #d8dee4;
		--code-bg: #f3f4f6;
		--accent: #0b5cad;
		--accent-bg: #e6f0fb;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--fg: #e6edf3;
			--muted: #9198a1;
			--bg: #0d1117;
			--border: #30363d;
			--code-bg: #161b22;
			--accent: #79b8ff;
			--accent-bg: #16283d;
		}
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font-family: system-ui, sans-serif;
	}

	:global(a) {
		color: var(--accent);
	}

	.layout {
		display: flex;
		gap: 2rem;
		max-width: 80rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	aside {
		position: sticky;
		top: 2rem;
		align-self: flex-start;
		flex: 0 0 15rem;
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
	}

	main {
		flex: 1;
		min-width: 0;
	}

	@media (max-width: 800px) {
		.layout {
			flex-direction: column;
		}

		aside {
			position: static;
			flex-basis: auto;
			max-height: none;
		}
	}
</style>
