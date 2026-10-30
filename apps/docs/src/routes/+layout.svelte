<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import { normalizeSlug } from '#lib/nav.js';
	import { SITE_NAME } from '#lib/site.js';
	import { pageUrl } from '#lib/url.js';
	import { ThemeControls } from '@szrs/ui';

	const { data, children } = $props();
</script>

<header class="border-b border-surface-200-800">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
		<a href={pageUrl('')} class="text-lg font-bold">{SITE_NAME}</a>
		<ThemeControls />
	</div>
</header>

<div class="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 md:flex-row">
	<aside
		class="md:sticky md:top-8 md:max-h-[calc(100vh-4rem)] md:w-60 md:flex-none md:self-start md:overflow-y-auto"
	>
		<Sidebar nav={data.nav} currentSlug={normalizeSlug(page.params.slug ?? '')} />
	</aside>
	<main class="min-w-0 flex-1">
		{@render children()}
	</main>
</div>
