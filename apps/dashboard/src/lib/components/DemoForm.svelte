<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { FormErrors, FormValues } from '#lib/forms.js';

	type Props = {
		action: string;
		submitLabel: string;
		initial?: { title: string; description: string | null };
		errors?: FormErrors;
		values?: FormValues;
	};

	const { action, submitLabel, initial, errors, values }: Props = $props();

	const title = $derived(values?.title ?? initial?.title ?? '');
	const description = $derived(values?.description ?? initial?.description ?? '');
</script>

<form method="POST" {action} use:enhance class="space-y-4">
	<label class="label">
		<span class="label-text">Title</span>
		<input class="input" name="title" type="text" value={title} required />
		{#each errors?.title ?? [] as message (message)}
			<p class="text-error-500" role="alert">{message}</p>
		{/each}
	</label>

	<label class="label">
		<span class="label-text">Description</span>
		<textarea class="textarea" name="description" rows="3" value={description}></textarea>
		{#each errors?.description ?? [] as message (message)}
			<p class="text-error-500" role="alert">{message}</p>
		{/each}
	</label>

	<button class="btn preset-filled" type="submit">{submitLabel}</button>
</form>
