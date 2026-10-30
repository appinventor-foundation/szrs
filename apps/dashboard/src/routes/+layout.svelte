<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import './layout.css';
	import { ThemeControls } from '@szrs/ui';

	const { children } = $props();
</script>

<header class="border-b border-surface-200-800">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
		<span class="text-lg font-bold">SZRS</span>
		<ThemeControls />
	</div>
</header>

<main class="mx-auto max-w-7xl px-6 py-8">
	{@render children()}
</main>
