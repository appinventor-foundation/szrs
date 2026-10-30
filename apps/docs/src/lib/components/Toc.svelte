<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import type { Heading } from '#lib/nav.js';

	const { headings }: { headings: Heading[] } = $props();
</script>

{#if headings.length > 0}
	<nav class="sticky top-8 hidden w-52 flex-none text-sm lg:block" aria-label="On this page">
		<h2 class="mb-2.5 text-xs font-semibold tracking-wider text-surface-800-200 uppercase">
			On this page
		</h2>
		<ul>
			{#each headings as heading (heading.id)}
				<li class={['my-1.5', heading.depth > 2 && 'pl-3.5']}>
					<a href="#{heading.id}" class="text-surface-800-200 hover:text-surface-950-50"
						>{heading.text}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
