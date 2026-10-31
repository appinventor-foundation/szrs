import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import prettier from 'eslint-config-prettier';
import turbo from 'eslint-config-turbo/flat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '../../.gitignore');

export const config = defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...turbo,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			'prefer-const': 'warn'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// State is derived with $derived, never synced with $effect. The one
		// legitimate use is syncing with an external system: disable this rule
		// on that line and say why.
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.name='$effect']",
					message:
						'Do not use $effect to derive state; use $derived. Only sync with an external system, with an eslint-disable and a reason.'
				},
				{
					selector: "CallExpression[callee.object.name='$effect']",
					message:
						'Do not use $effect.* to derive state; use $derived. Only sync with an external system, with an eslint-disable and a reason.'
				}
			]
		}
	},
	{
		// Components wire UI to data that routes load for them. Database access
		// and business logic live in the server layers, so they cannot be
		// imported from a component.
		files: ['**/*.svelte'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['drizzle-orm', 'drizzle-orm/*', 'drizzle-kit', 'postgres'],
							message: 'Database access belongs in a repository (lib/server/repositories).'
						},
						{
							// `#` starts a comment in these gitignore-style patterns, so escape it.
							group: ['\\#lib/server/*', '$lib/server/*'],
							message: 'Components must not import server-layer code; routes pass data in.'
						}
					]
				}
			]
		}
	}
);
