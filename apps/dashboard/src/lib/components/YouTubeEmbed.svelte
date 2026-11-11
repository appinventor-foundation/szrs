<!--
  Copyright 2026 appinventor.org
  Released under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0
-->
<script lang="ts">
	type Props = { videoId: string; title: string; poster: string };

	const { videoId, title, poster }: Props = $props();

	let playing = $state(false);
</script>

<!-- Nothing is loaded from YouTube until the poster is clicked. The embed is
     youtube-nocookie.com, YouTube's privacy-enhanced domain. -->
<div
	class="aspect-video w-full max-w-3xl overflow-hidden rounded-container border border-surface-300-700"
>
	{#if playing}
		<iframe
			{title}
			data-testid="youtube-embed"
			src="https://www.youtube-nocookie.com/embed/{encodeURIComponent(videoId)}?autoplay=1"
			class="size-full"
			allow="autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
			referrerpolicy="strict-origin-when-cross-origin"
		></iframe>
	{:else}
		<button
			type="button"
			data-testid="youtube-poster"
			aria-label="Play video: {title}"
			class="group relative block size-full cursor-pointer"
			onclick={() => (playing = true)}
		>
			<img src={poster} alt="" class="size-full object-cover" />
			<span
				class="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-black/70 text-3xl text-white transition-transform group-hover:scale-110 group-focus-visible:scale-110"
				aria-hidden="true">▶</span
			>
		</button>
	{/if}
</div>
