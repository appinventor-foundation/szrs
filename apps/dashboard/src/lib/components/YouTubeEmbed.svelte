<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	type Props = { videoId: string; title: string };

	const { videoId, title }: Props = $props();
</script>

<!-- youtube-nocookie.com is YouTube's privacy-enhanced embed: no cookies until play. -->
<iframe
	{title}
	data-testid="youtube-embed"
	src="https://www.youtube-nocookie.com/embed/{encodeURIComponent(videoId)}"
	class="aspect-video w-full max-w-3xl rounded-container border border-surface-300-700"
	allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
	referrerpolicy="strict-origin-when-cross-origin"
	loading="lazy"
></iframe>
