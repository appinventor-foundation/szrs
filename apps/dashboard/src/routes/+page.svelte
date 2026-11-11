<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import ProjectSummary from '#lib/components/ProjectSummary.svelte';
	import YouTubeEmbed from '#lib/components/YouTubeEmbed.svelte';
</script>

<div class="mt-4 space-y-4">
	<ProjectSummary />
	<YouTubeEmbed
		videoId="0neGKVIlDJs"
		title="SZRS: the main ideas of the project"
		poster={asset('video-poster.webp')}
	/>
</div>
