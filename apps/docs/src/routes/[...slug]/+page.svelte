<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import Toc from '#lib/components/Toc.svelte';
	import { SITE_NAME } from '#lib/site.js';

	const { data } = $props();
	const Content = $derived(data.content);
</script>

<svelte:head>
	<title>{data.page.slug ? `${data.page.title} · ${SITE_NAME}` : SITE_NAME}</title>
</svelte:head>

<div class="flex items-start gap-12">
	<article class="prose">
		<Content />
	</article>
	<Toc headings={data.page.headings} />
</div>
