// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/** Sampling parameters sent with every zoom call under a prompt. */
export interface ZoomPromptParams {
	temperature?: number;
	maxTokens?: number;
}

/**
 * A versioned zoom prompt. Immutable once it has produced recorded results or
 * been deployed: a change is a new id, so results and cache entries stay
 * attributable to the exact prompt that made them.
 */
export interface ZoomPrompt {
	id: string;
	system: string;
	/** The user message for a (canonical) request; `previousError` is set on a retry. */
	buildUser(
		request: { slug: string; workspaceJson: Record<string, unknown> },
		previousError?: string
	): string;
	params: ZoomPromptParams;
}
