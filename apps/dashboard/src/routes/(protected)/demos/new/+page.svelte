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

	const { form }: PageProps = $props();
</script>

<Breadcrumbs
	items={[{ label: 'Demos', href: resolve('/(protected)/demos') }, { label: 'New demo' }]}
/>

<h1 class="h1">New demo</h1>

<div class="mt-6 max-w-xl">
	<DemoForm
		action="?/create"
		submitLabel="Create demo"
		errors={form?.errors}
		values={form?.values}
	/>
	<a class="anchor mt-4 inline-block" href={resolve('/(protected)/demos')}>Cancel</a>
</div>
