<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	type Props = { messages?: string[] };

	const { messages = [] }: Props = $props();
</script>

{#each messages as message (message)}
	<p class="text-error-500" role="alert">{message}</p>
{/each}
