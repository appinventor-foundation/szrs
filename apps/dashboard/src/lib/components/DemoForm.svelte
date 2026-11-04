<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { FormErrors, FormValues } from '#lib/forms.js';
	import type { DemoKind } from '#lib/schemas/demo.js';
	import { SAMPLE_IDS, samples } from '#lib/samples/index.js';

	type Props = {
		action: string;
		submitLabel: string;
		initial?: {
			title: string;
			description: string | null;
			demoKind: DemoKind;
			starterKind: 'empty' | 'sample' | 'custom';
			sampleId: string | null;
			iframeUrl: string | null;
		};
		// Only admins choose an entry's demo and where its workspace starts.
		canSetDemo?: boolean;
		errors?: FormErrors;
		values?: FormValues;
	};

	const { action, submitLabel, initial, canSetDemo = false, errors, values }: Props = $props();

	const title = $derived(values?.title ?? initial?.title ?? '');
	const description = $derived(values?.description ?? initial?.description ?? '');
	const demoKind = $derived(values?.demoKind ?? initial?.demoKind ?? 'none');
	const starterKind = $derived(values?.starterKind ?? initial?.starterKind ?? 'empty');
	const iframeUrl = $derived(values?.iframeUrl ?? initial?.iframeUrl ?? '');
	const sampleId = $derived(values?.sampleId ?? initial?.sampleId ?? SAMPLE_IDS[0]);
	// A program saved from the runner can be kept but not typed into this form.
	const hasCustom = $derived(initial?.starterKind === 'custom');
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

	{#if canSetDemo}
		<!-- Which of the fields below show follows the chosen demo, in CSS alone, so the
		     form needs no script to behave. Fields that don't show are not read. -->
		<div class="group/demo space-y-4">
			<fieldset class="space-y-2">
				<legend class="label-text">Demo</legend>
				<p class="text-sm opacity-70">What <strong>Start demo</strong> runs for this entry.</p>
				<label class="flex items-center gap-2">
					<input
						class="radio"
						type="radio"
						name="demoKind"
						value="none"
						checked={demoKind === 'none'}
					/>
					<span>No demo</span>
				</label>
				<label class="flex items-center gap-2">
					<input
						class="radio"
						type="radio"
						name="demoKind"
						value="plugin"
						checked={demoKind === 'plugin'}
					/>
					<span>Plugin demo</span>
				</label>
				<label class="flex items-center gap-2">
					<input
						class="radio"
						type="radio"
						name="demoKind"
						value="iframe"
						checked={demoKind === 'iframe'}
					/>
					<span>Embedded page</span>
				</label>
				{#each errors?.demoKind ?? [] as message (message)}
					<p class="text-error-500" role="alert">{message}</p>
				{/each}
			</fieldset>

			<fieldset
				class="hidden space-y-2 group-has-[input[name=demoKind][value=plugin]:checked]/demo:block"
			>
				<legend class="label-text">Plugin demo opens with</legend>
				<p class="text-sm opacity-70">
					What the workspace shows until someone saves their own copy.
				</p>
				<label class="flex items-center gap-2">
					<input
						class="radio"
						type="radio"
						name="starterKind"
						value="empty"
						checked={starterKind === 'empty'}
					/>
					<span>Empty workspace</span>
				</label>
				<label class="flex items-center gap-2">
					<input
						class="radio"
						type="radio"
						name="starterKind"
						value="sample"
						checked={starterKind === 'sample'}
					/>
					<span>An example</span>
				</label>
				<select class="select ml-6 max-w-sm" name="sampleId" aria-label="Example">
					{#each SAMPLE_IDS as id (id)}
						<option value={id} selected={id === sampleId}>{samples[id].title}</option>
					{/each}
				</select>
				{#each errors?.sampleId ?? [] as message (message)}
					<p class="text-error-500" role="alert">{message}</p>
				{/each}
				{#if hasCustom}
					<label class="flex items-center gap-2">
						<input
							class="radio"
							type="radio"
							name="starterKind"
							value="custom"
							checked={starterKind === 'custom'}
						/>
						<span>The program saved from the demo runner</span>
					</label>
				{/if}
				{#each errors?.starterKind ?? [] as message (message)}
					<p class="text-error-500" role="alert">{message}</p>
				{/each}
			</fieldset>

			<div
				class="hidden space-y-2 group-has-[input[name=demoKind][value=iframe]:checked]/demo:block"
			>
				<label class="label">
					<span class="label-text">Page to embed</span>
					<input
						class="input"
						name="iframeUrl"
						type="url"
						placeholder="https://example.org/demo"
						value={iframeUrl}
					/>
				</label>
				<p class="text-sm opacity-70">
					Start demo opens this page inside the dashboard. The site must allow being embedded.
				</p>
				{#each errors?.iframeUrl ?? [] as message (message)}
					<p class="text-error-500" role="alert">{message}</p>
				{/each}
			</div>
		</div>
	{/if}

	<button class="btn preset-filled" type="submit">{submitLabel}</button>
</form>
