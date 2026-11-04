<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	type Props = { url: string; title: string };

	const { url, title }: Props = $props();
</script>

<!-- The page is someone else's: it runs in a sandbox, and the link is there for
     pages that refuse to be framed. -->
<iframe
	{title}
	src={url}
	class="h-[70vh] w-full rounded-container border border-surface-300-700"
	sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
	allow="fullscreen"
	referrerpolicy="no-referrer"
></iframe>
<p class="mt-2 text-sm">
	Does the page look empty? Some sites don't allow being embedded.
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external page -->
	<a class="anchor" href={url} target="_blank" rel="noopener noreferrer">Open it in a new tab</a>
</p>
