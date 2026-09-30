// Copyright 2026 appinventor.org, All rights reserved
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * @fileoverview The model used for zooms: which aliases are available, which
 * is selected, and remembering the choice between visits.
 */

/** The part of localStorage the store uses. */
export interface ModelStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'szrs.zoomModel';

export class ModelStore {
	private selected: string;
	/** Whether the user has picked a model in this session. */
	private chosen = false;
	private available: string[];
	private readonly listeners = new Set<() => void>();

	/**
	 * @param defaultModel The host-configured alias. It is used until the
	 *     list arrives, and whenever the remembered choice isn't available.
	 * @param storage Where the choice is remembered. Defaults to localStorage,
	 *     and the store works without it (private windows, blocked storage).
	 */
	constructor(
		private readonly defaultModel: string,
		private readonly storage: ModelStorage | null = defaultStorage()
	) {
		this.selected = defaultModel;
		this.available = [defaultModel];
	}

	get current(): string {
		return this.selected;
	}

	get models(): readonly string[] {
		return this.available;
	}

	/** Sets the aliases the proxy offers, and restores the remembered choice if it is among them. */
	setModels(models: string[]): void {
		if (models.length === 0) return;
		this.available = models;
		// A pick made before the list arrived wins over the remembered one.
		const stored = this.chosen ? this.selected : this.read();
		this.selected = stored && models.indexOf(stored) !== -1 ? stored : this.defaultModel;
		this.notify();
	}

	select(model: string): void {
		if (model === this.selected) return;
		this.selected = model;
		this.chosen = true;
		this.write(model);
		this.notify();
	}

	/** Calls `listener` when the list or the selection changes. Returns a function that stops it. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private read(): string | null {
		try {
			return this.storage?.getItem(STORAGE_KEY) ?? null;
		} catch {
			return null;
		}
	}

	private write(model: string): void {
		try {
			this.storage?.setItem(STORAGE_KEY, model);
		} catch {
			// Storage is unavailable; the choice just won't survive a reload.
		}
	}
}

function defaultStorage(): ModelStorage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}
