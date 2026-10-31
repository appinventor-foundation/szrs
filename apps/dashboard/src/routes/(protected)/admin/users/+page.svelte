<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import FieldErrors from '#lib/components/FieldErrors.svelte';
	import { ROLES } from '#lib/schemas/user.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();

	const errors = $derived(form && 'errors' in form ? form.errors : undefined);
	const values = $derived(form && 'values' in form ? form.values : undefined);
</script>

<h1 class="h1">Users</h1>

<section class="card preset-outlined-surface-200-800 mt-6 max-w-xl p-4">
	<h2 class="h4 mb-4">New user</h2>
	<form method="POST" action="?/create" use:enhance class="space-y-4">
		<FieldErrors messages={errors?.form} />

		<label class="label">
			<span class="label-text">Name</span>
			<input class="input" name="name" type="text" value={values?.name ?? ''} required />
			<FieldErrors messages={errors?.name} />
		</label>

		<label class="label">
			<span class="label-text">Email</span>
			<input class="input" name="email" type="email" value={values?.email ?? ''} required />
			<FieldErrors messages={errors?.email} />
		</label>

		<label class="label">
			<span class="label-text">Password</span>
			<input class="input" name="password" type="password" autocomplete="new-password" required />
			<FieldErrors messages={errors?.password} />
		</label>

		<label class="label">
			<span class="label-text">Role</span>
			<select class="select" name="role" value={values?.role ?? 'user'}>
				{#each ROLES as role (role)}
					<option value={role}>{role}</option>
				{/each}
			</select>
			<FieldErrors messages={errors?.role} />
		</label>

		<button class="btn preset-filled" type="submit">Create user</button>
	</form>
</section>

<section class="mt-8">
	<table class="table" aria-label="Users">
		<thead>
			<tr>
				<th>Name</th>
				<th>Email</th>
				<th>Role</th>
				<th>Status</th>
				<th><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user (user.id)}
				<tr>
					<td>{user.name}</td>
					<td>{user.email}</td>
					<td>{user.role}</td>
					<td>{user.banned ? 'Banned' : 'Active'}</td>
					<td>
						<a
							class="btn preset-tonal"
							href={resolve('/(protected)/admin/users/[id]', { id: user.id })}
							aria-label={`Manage ${user.email}`}>Manage</a
						>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>
