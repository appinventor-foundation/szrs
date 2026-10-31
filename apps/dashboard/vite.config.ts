import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	// A fixed port, because DASHBOARD_URL has to match it (better-auth trusts only
	// that origin) and `turbo dev` starts the docs app at the same time, which
	// also defaults to 5173. strictPort makes a clash fail loudly instead of
	// moving to another port.
	server: { port: 5174, strictPort: true },
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
