<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import './layout.css';
	import { ThemeControls } from '@szrs/ui';
	import { resolve } from '$app/paths';

	const { children } = $props();
</script>

<header class="border-b border-surface-200-800">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
		<nav class="flex items-center gap-6">
			<a class="text-lg font-bold" href={resolve('/')}>SZRS</a>
			<a class="anchor" href={resolve('/demos')}>Demos</a>
		</nav>
		<ThemeControls />
	</div>
</header>

<main class="mx-auto max-w-7xl px-6 py-8">
	{@render children()}
</main>
