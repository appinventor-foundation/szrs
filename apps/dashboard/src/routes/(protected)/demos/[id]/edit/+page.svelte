<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import DemoForm from '#lib/components/DemoForm.svelte';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
</script>

<Breadcrumbs
	items={[
		{ label: 'Demos', href: resolve('/(protected)/demos') },
		{ label: data.demo.title, href: resolve('/(protected)/demos/[id]', { id: data.demo.id }) },
		{ label: 'Edit' }
	]}
/>

<h1 class="h1">Edit demo</h1>

<div class="mt-6 max-w-xl">
	<DemoForm
		action="?/update"
		submitLabel="Save changes"
		initial={data.demo}
		errors={form?.errors}
		values={form?.values}
	/>
	<a
		class="anchor mt-4 inline-block"
		href={resolve('/(protected)/demos/[id]', { id: data.demo.id })}>Cancel</a
	>
</div>
