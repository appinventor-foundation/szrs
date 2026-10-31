<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import FieldErrors from '#lib/components/FieldErrors.svelte';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();

	const errors = $derived(form && 'errors' in form ? form.errors : undefined);
	const email = $derived(form && 'values' in form ? (form.values.email ?? '') : '');
</script>

<h1 class="h1">Sign in</h1>

<form
	method="POST"
	use:enhance
	class="card preset-outlined-surface-200-800 mt-6 max-w-sm space-y-4 p-4"
>
	<input type="hidden" name="redirectTo" value={data.redirectTo} />

	<FieldErrors messages={errors?.form} />

	<label class="label">
		<span class="label-text">Email</span>
		<input class="input" name="email" type="email" autocomplete="username" value={email} required />
		<FieldErrors messages={errors?.email} />
	</label>

	<label class="label">
		<span class="label-text">Password</span>
		<input class="input" name="password" type="password" autocomplete="current-password" required />
		<FieldErrors messages={errors?.password} />
	</label>

	<button class="btn preset-filled" type="submit">Sign in</button>
</form>
