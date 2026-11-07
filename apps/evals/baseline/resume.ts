// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { BaselineFile } from './summary.js';

/** What a run writes before its records: who ran what, on which code. */
export type RunHeader = Omit<BaselineFile, 'records'> & {
	litellm?: string;
	samples?: number;
	/** How long one call could take before it was recorded as a timeout. */
	callTimeoutSeconds?: number;
	resumedAt?: string[];
};

/**
 * Whether a run may be continued from a file made on other code. Records made on
 * different commits must not share one file: the prompts, the corpus and the
 * validators are all code, and the header can only name one commit.
 */
export function checkResume(existing: RunHeader, current?: { commit: string }): void {
	if (existing.code && current && existing.code.commit !== current.commit) {
		throw new Error(
			`The run was made on commit ${existing.code.commit} and this is ${current.commit}. Results from different code must not share a run: start a new run (--run-id), or check out ${existing.code.commit} to continue this one.`
		);
	}
}

/**
 * The header of a resumed run: what the file already says, plus what this
 * invocation adds (more models, more prompts), so the header always describes
 * every record in the file. A prompt that has changed since the run started is an
 * error: its earlier records were made with other text.
 */
export function mergeHeader(existing: RunHeader, current: RunHeader): RunHeader {
	const prompts = [...(existing.prompts ?? [])];
	for (const prompt of current.prompts ?? []) {
		const before = prompts.find((candidate) => candidate.id === prompt.id);
		if (before === undefined) prompts.push(prompt);
		else if (before.fingerprint !== prompt.fingerprint) {
			throw new Error(
				`Prompt ${prompt.id} has changed since this run started (its fingerprint differs). Start a new run.`
			);
		}
	}
	return {
		...current,
		runId: existing.runId,
		ranAt: existing.ranAt ?? current.ranAt,
		resumedAt: [...(existing.resumedAt ?? []), ...(current.ranAt ? [current.ranAt] : [])],
		code: existing.code ?? current.code,
		modelIds: [...new Set([...existing.modelIds, ...current.modelIds])],
		models: { ...existing.models, ...current.models },
		prompts,
		samples: Math.max(existing.samples ?? 1, current.samples ?? 1)
	};
}
