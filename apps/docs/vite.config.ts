import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { fileURLToPath } from 'node:url';
import { rehypeDocs } from './src/lib/markdown/rehype-docs.js';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// Set BASE_PATH when the site is served from a sub path, e.g. BASE_PATH=/szrs for GitHub Pages.
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

const contentDir = fileURLToPath(new URL('./content', import.meta.url));

export default defineConfig({
	plugins: [
		sveltekit({
			extensions: ['.svelte', '.md'],
			preprocess: [
				mdsvex({
					extensions: ['.md'],
					rehypePlugins: [[rehypeDocs, { contentDir, base }]]
				}),
				vitePreprocess()
			],

			// Plain HTML files in build/, which any static host can serve.
			adapter: adapter({ strict: true }),
			paths: { base }
		})
	]
});
