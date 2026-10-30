import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			// See https://svelte.dev/docs/kit/integrations#Preprocessors for more information about preprocessors.
			preprocess: vitePreprocess(),

			// A standalone Node server (build/index.js), which is what the Dockerfile runs.
			// See https://svelte.dev/docs/kit/adapter-node.
			adapter: adapter()
		})
	]
});
