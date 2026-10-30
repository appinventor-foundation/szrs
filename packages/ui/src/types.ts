// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * A basic counter.
 */
export type Counter = {
	readonly count: number;
	decrement(): void;
	increment(): void;
};

/**
 * The themes offered by the theme picker. Each one is imported in theme.css.
 */
export type Theme = 'catppuccin' | 'mona' | 'seafoam' | 'vintage';

/**
 * Light or dark appearance, independent of the theme.
 */
export type Mode = 'light' | 'dark';

/**
 * The visitor's theme and mode, kept on <html> (data-theme and data-mode) and in
 * localStorage so it survives a reload.
 */
export type ThemeState = {
	readonly theme: Theme;
	readonly mode: Mode;
	/** Adopt what the inline script in app.html already put on <html>. */
	sync(): void;
	setTheme(theme: Theme): void;
	toggleMode(): void;
};
