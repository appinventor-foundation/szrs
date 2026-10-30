// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { Mode, Theme, ThemeState } from './types';

export const THEMES: readonly { id: Theme; label: string }[] = [
	{ id: 'catppuccin', label: 'Catppuccin' },
	{ id: 'mona', label: 'Mona' },
	{ id: 'seafoam', label: 'Seafoam' },
	{ id: 'vintage', label: 'Vintage' }
];

export const DEFAULT_THEME: Theme = 'catppuccin';

// The inline script in each app.html reads these same keys.
export const THEME_STORAGE_KEY = 'szrs-theme';
export const MODE_STORAGE_KEY = 'szrs-mode';

export function isTheme(value: unknown): value is Theme {
	return THEMES.some((theme) => theme.id === value);
}

export function isMode(value: unknown): value is Mode {
	return value === 'light' || value === 'dark';
}

function store(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage can be blocked (private windows, site settings); the choice then lasts one page view.
	}
}

/**
 * Creates the theme state. Call it once per page: the first-paint values come from
 * the inline script in app.html, so nothing is read until sync() runs in the browser.
 */
export function newThemeState(): ThemeState {
	let theme = $state<Theme>(DEFAULT_THEME);
	let mode = $state<Mode>('light');

	return {
		get theme() {
			return theme;
		},
		get mode() {
			return mode;
		},
		sync() {
			const root = document.documentElement;
			const currentTheme = root.getAttribute('data-theme');
			const currentMode = root.getAttribute('data-mode');
			if (isTheme(currentTheme)) theme = currentTheme;
			if (isMode(currentMode)) mode = currentMode;
		},
		setTheme(next) {
			theme = next;
			document.documentElement.setAttribute('data-theme', next);
			store(THEME_STORAGE_KEY, next);
		},
		toggleMode() {
			mode = mode === 'dark' ? 'light' : 'dark';
			document.documentElement.setAttribute('data-mode', mode);
			store(MODE_STORAGE_KEY, mode);
		}
	};
}
