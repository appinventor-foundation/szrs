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
