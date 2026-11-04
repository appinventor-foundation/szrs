<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { BlocklyEditor } from '#lib/client/blockly-editor.svelte.js';
	import { isSampleId, SAMPLE_IDS, samples } from '#lib/samples/index.js';
	import type { Workspace } from '#lib/schemas/workspace.js';
	import BlocklyWorkspace from './BlocklyWorkspace.svelte';

	type Props = {
		demoId: string;
		workspace: Workspace | null;
		source: 'saved' | 'starter' | 'empty';
		canSetStarter: boolean;
		model: string;
	};

	const { demoId, workspace, source, canSetStarter, model }: Props = $props();

	// A new editor when the workspace to open changes (after a reset, or another demo).
	const editor = $derived(
		new BlocklyEditor({
			// The dashboard forwards these calls to the LLM proxy.
			proxyUrl: '/api/szrs',
			model,
			slug: `demo_${demoId.replaceAll('-', '').slice(0, 8)}`,
			initial: workspace
		})
	);

	let message = $state('');

	const origin = $derived(
		source === 'saved'
			? 'Showing your saved copy.'
			: source === 'starter'
				? 'Showing the demo’s starting program.'
				: 'Starting from an empty workspace.'
	);

	const done = {
		saved: 'Saved.',
		starter: 'Saved as the starting program.',
		reset: 'Back to the starting program.'
	};

	// Puts an example (or an empty workspace) on the workspace; the picker goes back
	// to its prompt so the same example can be loaded again.
	function loadExample(event: Event & { currentTarget: HTMLSelectElement }) {
		const choice = event.currentTarget.value;
		event.currentTarget.value = '';
		if (choice === 'empty') editor.load(null);
		else if (isSampleId(choice)) editor.load(samples[choice].workspace);
	}

	// Sends the workspace as it is now; the actions that reset do not need it.
	const withWorkspace: SubmitFunction = ({ formData, cancel }) => {
		const current = editor.serialize();
		if (!current) return cancel();
		formData.set('workspace', JSON.stringify(current));
		return handle(false);
	};
	const withoutWorkspace: SubmitFunction = () => handle(true);

	function handle(refresh: boolean): ReturnType<SubmitFunction> {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const kind = (result.data as { done?: keyof typeof done } | undefined)?.done;
				message = kind ? done[kind] : '';
				if (kind === 'saved') editor.markSaved();
			} else if (result.type === 'failure') {
				message =
					(result.data as { message?: string } | undefined)?.message ?? 'Something went wrong.';
			} else {
				message = 'Something went wrong.';
			}
			// Reloading the page data opens the starting program again; saving leaves
			// the workspace as the person has it, with its position and zoom.
			await update({ reset: false, invalidateAll: refresh });
		};
	}
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-2">
		<form method="POST" action="?/save" use:enhance={withWorkspace}>
			<button class="btn preset-filled" type="submit" disabled={!editor.ready}>Save</button>
		</form>
		<form method="POST" action="?/reset" use:enhance={withoutWorkspace}>
			<button class="btn preset-tonal" type="submit" disabled={!editor.ready}>
				Reset to starting program
			</button>
		</form>
		{#if canSetStarter}
			<form method="POST" action="?/saveStarter" use:enhance={withWorkspace}>
				<button class="btn preset-tonal" type="submit" disabled={!editor.ready}>
					Save as starting program
				</button>
			</form>
		{/if}
		<select
			class="select w-auto"
			aria-label="Load an example"
			disabled={!editor.ready}
			onchange={loadExample}
		>
			<option value="">Load an example…</option>
			<option value="empty">Empty workspace</option>
			{#each SAMPLE_IDS as id (id)}
				<option value={id}>{samples[id].title}</option>
			{/each}
		</select>
		<span class="text-sm opacity-70">
			{origin}
			{#if editor.dirty}<strong>Unsaved changes.</strong>{/if}
		</span>
	</div>
	<p class="text-sm" role="status" data-testid="run-status">{message}</p>

	<BlocklyWorkspace {editor} />
</div>
