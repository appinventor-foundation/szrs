<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '#lib/components/DataTable.svelte';
	import { ROLES, type UserRecord } from '#lib/schemas/user.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
	const statusOf = (user: UserRecord) => (user.banned ? 'Banned' : 'Active');

	const columns = [
		{ key: 'name', header: 'Name', sortValue: (user: UserRecord) => user.name },
		{ key: 'email', header: 'Email', sortValue: (user: UserRecord) => user.email },
		{ key: 'role', header: 'Role', sortValue: (user: UserRecord) => user.role },
		{ key: 'status', header: 'Status', sortValue: (user: UserRecord) => statusOf(user) },
		{ key: 'created', header: 'Created', sortValue: (user: UserRecord) => user.createdAt }
	];
	const filters = [
		{
			key: 'role',
			label: 'Filter by role',
			allLabel: 'All roles',
			get: (user: UserRecord) => user.role,
			options: ROLES.map((role) => ({ value: role, label: role }))
		},
		{
			key: 'status',
			label: 'Filter by status',
			allLabel: 'All statuses',
			get: statusOf,
			options: [
				{ value: 'Active', label: 'Active' },
				{ value: 'Banned', label: 'Banned' }
			]
		}
	];
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
	<DataTable
		rows={data.users}
		label="Users"
		{columns}
		rowKey={(user) => user.id}
		haystack={(user) => `${user.name} ${user.email}`}
		searchLabel="Search users"
		{filters}
	>
		{#snippet row(user)}
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
					>{statusOf(user)}</span
				>
			</td>
			<td class="whitespace-nowrap">{dateFormat.format(user.createdAt)}</td>
		{/snippet}
	</DataTable>
</section>
