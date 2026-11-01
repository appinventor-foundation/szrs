<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { ThemeControls } from '@szrs/ui';
	import { resolve } from '$app/paths';
	import { avatarInitial, roleLabel } from '#lib/user-menu.js';

	type Props = { user: { name: string; email: string; isAdmin: boolean } };

	const { user }: Props = $props();

	// A <details> element, so the menu opens and Sign out works without JS.
	// The handlers below add the usual extras: Escape and outside click close it.
	// They read and write the element's own `open`, not a bound copy: bind:open only
	// updates when the browser later fires `toggle`, so right after opening it is
	// still stale and an immediate Escape would be ignored (flaky on slow CI).
	let menu: HTMLDetailsElement | undefined = $state();
	let trigger: HTMLElement | undefined = $state();

	const initial = $derived(avatarInitial(user.name, user.email));
	const role = $derived(roleLabel(user.isAdmin));
</script>

<svelte:window
	onclick={(event) => {
		// composedPath() is fixed at dispatch time. event.target can be detached by a
		// re-render before this runs (the mode toggle swaps its icon), so it would
		// wrongly look like a click outside.
		if (menu?.open && !event.composedPath().includes(menu)) menu.open = false;
	}}
	onkeydown={(event) => {
		if (menu?.open && event.key === 'Escape') {
			menu.open = false;
			trigger?.focus();
		}
	}}
/>

<details class="relative" bind:this={menu}>
	<summary
		bind:this={trigger}
		aria-label="Account menu"
		class="btn-icon preset-filled-primary-500 cursor-pointer list-none rounded-full font-bold select-none [&::-webkit-details-marker]:hidden"
	>
		<span aria-hidden="true">{initial}</span>
	</summary>

	<div
		class="card preset-filled-surface-100-900 border-surface-200-800 absolute right-0 z-10 mt-2 w-72 space-y-3 border p-4 shadow-lg"
	>
		<div class="min-w-0">
			<p class="truncate font-bold">{user.name}</p>
			<p class="truncate text-sm opacity-80">{user.email}</p>
			<p class="mt-2">
				<span class="badge preset-tonal">{role}</span>
			</p>
		</div>

		<hr class="hr" />

		<div>
			<p class="mb-2 text-sm font-semibold">Appearance</p>
			<ThemeControls />
		</div>

		<hr class="hr" />

		<form method="POST" action={resolve('/logout')}>
			<button class="btn preset-tonal w-full" type="submit">Sign out</button>
		</form>
	</div>
</details>
