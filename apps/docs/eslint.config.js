import { config } from '@szrs/eslint-config';

export default [
	...config,
	{
		files: ['**/*.svelte'],
		rules: {
			// Crashes on any href that is not a literal: eslint-plugin-svelte 3.23 reads ts.TypeFlags,
			// which does not exist in the TypeScript 7 API. Turn back on once it supports it.
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
];
