<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	// Every item but the last needs an href; the last is the current page.
	type Crumb = { label: string; href?: string };
	type Props = { items: Crumb[] };

	const { items }: Props = $props();
</script>

<nav aria-label="Breadcrumb" class="mb-4 text-sm">
	<ol class="flex flex-wrap items-center gap-2">
		{#each items as item, index (index)}
			{@const current = index === items.length - 1}
			<li class="flex items-center gap-2">
				{#if index > 0}
					<span aria-hidden="true" class="opacity-60">/</span>
				{/if}
				{#if current || !item.href}
					<span aria-current={current ? 'page' : undefined} class="font-semibold">{item.label}</span
					>
				{:else}
					<a class="anchor" href={item.href}>{item.label}</a>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
