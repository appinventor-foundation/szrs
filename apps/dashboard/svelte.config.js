import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// See https://svelte.dev/docs/kit/integrations#Preprocessors for more information about preprocessors.
	preprocess: vitePreprocess(),
	kit: {
		// A standalone Node server (build/index.js), which is what the Dockerfile runs.
		// See https://svelte.dev/docs/kit/adapter-node.
		adapter: adapter()
	}
};

export default config;
