<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import type { BlocklyEditor } from '#lib/client/blockly-editor.svelte.js';

	type Props = { editor: BlocklyEditor };

	const { editor }: Props = $props();
</script>

<!-- Blockly needs a box with a real height to draw in. -->
<div
	class="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-base border border-surface-300-700"
	data-testid="blockly-workspace"
	data-workspace-ready={editor.ready}
	{@attach editor.attach}
></div>
{#if editor.failure}
	<p class="mt-2 text-error-500" role="alert">{editor.failure}</p>
{/if}

<style>
	/* Blockly hides things such as the flyout's scrollbar with a display="none"
	   attribute on an <svg>. Tailwind's base styles give every <svg> display:block,
	   and a stylesheet beats that attribute, so the scrollbar stayed on screen after
	   the flyout closed. */
	div :global(svg[display='none']) {
		display: none;
	}
</style>
