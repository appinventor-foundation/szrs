<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<div class="flex items-center justify-between gap-4">
	<h1 class="h1">Users</h1>
	<a class="btn preset-filled" href={resolve('/(protected)/admin/users/new')}>
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
		<span>New user</span>
	</a>
</div>

{#if data.deleted}
	<p class="card preset-tonal-success mt-4 p-3" role="status">User deleted.</p>
{/if}

<section class="mt-6">
	<div class="table-wrap">
		<table class="table" aria-label="Users">
			<thead>
				<tr>
					<th scope="col">Name</th>
					<th scope="col">Email</th>
					<th scope="col">Role</th>
					<th scope="col">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user (user.id)}
					<tr class="hover:preset-tonal relative">
						<td class="font-bold">
							<a
								class="anchor after:absolute after:inset-0"
								href={resolve('/(protected)/admin/users/[id]', { id: user.id })}>{user.name}</a
							>
						</td>
						<td>{user.email}</td>
						<td><span class="badge preset-tonal">{user.role}</span></td>
						<td>
							<span class="badge {user.banned ? 'preset-tonal-error' : 'preset-tonal-success'}"
								>{user.banned ? 'Banned' : 'Active'}</span
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
