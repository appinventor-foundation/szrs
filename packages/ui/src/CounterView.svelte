<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { newCounter } from './counter.svelte';

	const _counter = newCounter();
</script>

<button onclick={() => _counter.decrement()}>-</button>

Current count: {_counter.count}

<button onclick={() => _counter.increment()}>+</button>
