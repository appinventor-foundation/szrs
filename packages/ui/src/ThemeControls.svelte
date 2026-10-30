<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { THEMES, isTheme, newThemeState } from './theme.svelte.js';

	const id = $props.id();
	const themeState = newThemeState();

	onMount(() => themeState.sync());
</script>

<div class="flex items-center gap-2">
	<label class="sr-only" for="{id}-theme">Theme</label>
	<select
		id="{id}-theme"
		class="select w-auto"
		value={themeState.theme}
		onchange={(event) => {
			const value = event.currentTarget.value;
			if (isTheme(value)) themeState.setTheme(value);
		}}
	>
		{#each THEMES as theme (theme.id)}
			<option value={theme.id}>{theme.label}</option>
		{/each}
	</select>

	<button
		type="button"
		class="btn-icon preset-tonal"
		aria-label={themeState.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		onclick={() => themeState.toggleMode()}
	>
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			{#if themeState.mode === 'dark'}
				<circle cx="12" cy="12" r="4" />
				<path
					d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
				/>
			{:else}
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
			{/if}
		</svg>
	</button>
</div>
