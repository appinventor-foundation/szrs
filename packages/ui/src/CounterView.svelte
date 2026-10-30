<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { newCounter } from './counter.svelte';

	const _counter = newCounter();
</script>

<button class="btn preset-tonal-primary" onclick={() => _counter.decrement()}>-</button>

Current count: {_counter.count}

<button class="btn preset-tonal-primary" onclick={() => _counter.increment()}>+</button>
