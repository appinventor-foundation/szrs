<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
</script>

<div class="flex items-center justify-between gap-4">
	<h1 class="h1">Demos</h1>
	<a class="btn preset-filled" href={resolve('/(protected)/demos/new')}>
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
		>
			<path d="M12 5v14M5 12h14" />
		</svg>
		<span>New demo</span>
	</a>
</div>

{#if data.deleted}
	<p class="card preset-tonal-success mt-4 p-3" role="status">Demo deleted.</p>
{/if}

<section class="mt-6">
	{#if data.demos.length === 0}
		<div class="card preset-outlined-surface-200-800 p-8 text-center">
			<p class="mb-4">No demos yet.</p>
			<a class="btn preset-tonal" href={resolve('/(protected)/demos/new')}>Create your first demo</a
			>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="table" aria-label="Demos">
				<thead>
					<tr>
						<th scope="col">Title</th>
						<th scope="col">Description</th>
						<th scope="col">Created</th>
					</tr>
				</thead>
				<tbody>
					{#each data.demos as demo (demo.id)}
						<tr class="hover:preset-tonal relative">
							<td class="font-bold">
								<a
									class="anchor after:absolute after:inset-0"
									href={resolve('/(protected)/demos/[id]', { id: demo.id })}>{demo.title}</a
								>
							</td>
							<td class="max-w-md"
								><p class="line-clamp-2 break-words">{demo.description ?? ''}</p></td
							>
							<td class="whitespace-nowrap">{dateFormat.format(demo.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
