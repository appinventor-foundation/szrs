<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import FieldErrors from '#lib/components/FieldErrors.svelte';
	import { ROLES } from '#lib/schemas/user.js';
	import type { PageProps } from './$types';

	const { form }: PageProps = $props();

	const errors = $derived(form?.errors);
	const values = $derived(form?.values);
</script>

<Breadcrumbs
	items={[{ label: 'Users', href: resolve('/(protected)/admin/users') }, { label: 'New user' }]}
/>

<h1 class="h1">New user</h1>

<div class="mt-6 max-w-xl">
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
	<a class="anchor mt-4 inline-block" href={resolve('/(protected)/admin/users')}>Cancel</a>
</div>
