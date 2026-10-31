<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DemoForm from '#lib/components/DemoForm.svelte';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
</script>

<h1 class="h1">Demos</h1>

<section class="card preset-outlined-surface-200-800 mt-6 max-w-xl p-4">
	<h2 class="h4 mb-4">New demo</h2>
	<DemoForm
		action="?/create"
		submitLabel="Create demo"
		errors={form && 'errors' in form ? form.errors : undefined}
		values={form && 'values' in form ? form.values : undefined}
	/>
</section>

<section class="mt-8">
	{#if data.demos.length === 0}
		<p>No demos yet.</p>
	{:else}
		<ul class="space-y-3" aria-label="Demos">
			{#each data.demos as demo (demo.id)}
				<li class="card preset-outlined-surface-200-800 flex items-center justify-between p-4">
					<div>
						<p class="font-bold">{demo.title}</p>
						{#if demo.description}
							<p>{demo.description}</p>
						{/if}
					</div>
					<div class="flex items-center gap-2">
						<a
							class="btn preset-tonal"
							href={resolve('/(protected)/demos/[id]', { id: demo.id })}
							aria-label={`Edit ${demo.title}`}>Edit</a
						>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={demo.id} />
							<button
								class="btn preset-tonal-error"
								type="submit"
								aria-label={`Delete ${demo.title}`}>Delete</button
							>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
