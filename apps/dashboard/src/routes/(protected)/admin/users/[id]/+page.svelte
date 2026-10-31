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

	// What the last submitted form on this page reported, if it was this one.
	const errorsFor = (name: string) =>
		form && 'action' in form && form.action === name && 'errors' in form ? form.errors : undefined;
	const succeeded = (name: string) =>
		form && 'action' in form && form.action === name && 'success' in form && form.success;
</script>

<h1 class="h1">{data.user.name}</h1>
<p class="mt-2">
	{data.user.email} · {data.user.role} · {data.user.banned ? 'Banned' : 'Active'}
</p>
{#if data.user.banned && data.user.banReason}
	<p>Reason: {data.user.banReason}</p>
{/if}
{#if data.isSelf}
	<p class="mt-2">This is your own account: you cannot change your role, ban or delete yourself.</p>
{/if}

<div class="mt-6 grid max-w-xl gap-6">
	<section class="card preset-outlined-surface-200-800 p-4">
		<h2 class="h4 mb-4">Role</h2>
		<form method="POST" action="?/setRole" use:enhance class="space-y-4">
			<FieldErrors messages={errorsFor('setRole')?.form} />
			<label class="label">
				<span class="label-text">Role</span>
				<select class="select" name="role" value={data.user.role} disabled={data.isSelf}>
					{#each ROLES as role (role)}
						<option value={role}>{role}</option>
					{/each}
				</select>
				<FieldErrors messages={errorsFor('setRole')?.role} />
			</label>
			<button class="btn preset-filled" type="submit" disabled={data.isSelf}>Save role</button>
			{#if succeeded('setRole')}<p role="status">Role updated</p>{/if}
		</form>
	</section>

	<section class="card preset-outlined-surface-200-800 p-4">
		<h2 class="h4 mb-4">Password</h2>
		<form method="POST" action="?/setPassword" use:enhance class="space-y-4">
			<FieldErrors messages={errorsFor('setPassword')?.form} />
			<label class="label">
				<span class="label-text">New password</span>
				<input class="input" name="password" type="password" autocomplete="new-password" required />
				<FieldErrors messages={errorsFor('setPassword')?.password} />
			</label>
			<button class="btn preset-filled" type="submit">Set password</button>
			{#if succeeded('setPassword')}<p role="status">Password updated</p>{/if}
		</form>
	</section>

	<section class="card preset-outlined-surface-200-800 p-4">
		<h2 class="h4 mb-4">Access</h2>
		<div class="space-y-4">
			{#if data.user.banned}
				<form method="POST" action="?/unban" use:enhance>
					<FieldErrors messages={errorsFor('unban')?.form} />
					<button class="btn preset-filled" type="submit">Unban</button>
				</form>
			{:else}
				<form method="POST" action="?/ban" use:enhance class="space-y-4">
					<FieldErrors messages={errorsFor('ban')?.form} />
					<label class="label">
						<span class="label-text">Reason (optional)</span>
						<input class="input" name="reason" type="text" />
						<FieldErrors messages={errorsFor('ban')?.reason} />
					</label>
					<button class="btn preset-tonal-error" type="submit" disabled={data.isSelf}>Ban</button>
				</form>
			{/if}

			<form method="POST" action="?/revokeSessions" use:enhance>
				<FieldErrors messages={errorsFor('revokeSessions')?.form} />
				<button class="btn preset-tonal" type="submit">Sign out everywhere</button>
				{#if succeeded('revokeSessions')}<p role="status">Sessions revoked</p>{/if}
			</form>
		</div>
	</section>

	<section class="card preset-outlined-surface-200-800 p-4">
		<h2 class="h4 mb-4">Delete</h2>
		<form method="POST" action="?/remove" use:enhance>
			<FieldErrors messages={errorsFor('remove')?.form} />
			<button class="btn preset-tonal-error" type="submit" disabled={data.isSelf}
				>Delete user</button
			>
		</form>
	</section>
</div>

<a class="anchor mt-6 inline-block" href={resolve('/(protected)/admin/users')}>Back to users</a>
