<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { ThemeControls } from '@szrs/ui';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	const { children, data }: LayoutProps = $props();

	// Marks the page as interactive. The e2e tests wait for it: hydration resets
	// form fields, so anything typed before it finishes is lost.
	onMount(() => {
		document.documentElement.dataset.hydrated = 'true';
	});
</script>

<header class="border-b border-surface-200-800">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
		<nav class="flex items-center gap-6">
			<a class="text-lg font-bold" href={resolve('/')}>SZRS</a>
			{#if data.user}
				<a class="anchor" href={resolve('/(protected)/demos')}>Demos</a>
				{#if data.user.isAdmin}
					<a class="anchor" href={resolve('/(protected)/admin/users')}>Users</a>
				{/if}
			{/if}
		</nav>
		<div class="flex items-center gap-4">
			{#if data.user}
				<span>{data.user.name}</span>
				<form method="POST" action={resolve('/logout')}>
					<button class="btn preset-tonal" type="submit">Sign out</button>
				</form>
			{:else}
				<a class="btn preset-filled" href={resolve('/login')}>Sign in</a>
			{/if}
			<ThemeControls />
		</div>
	</div>
</header>

<main class="mx-auto max-w-7xl px-6 py-8">
	{@render children()}
</main>
