// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { createHash } from 'node:crypto';

import { stableStringify } from '@szrs/llm-proxy/zoom/cache-key.js';
import { normalizeWorkspace } from '@szrs/llm-proxy/zoom/normalize.js';
import { toSnakeSlug } from '@szrs/llm-proxy/zoom/prompts/index.js';
import type { CorpusProgram } from './corpus/index.js';
import { saveAsBlockly } from './headless.js';

export interface PreparedProgram {
	program: CorpusProgram;
	/** The slug the model is given; it prefixes the zoom block types. */
	slug: string;
	/** The workspace as the proxy hands it to the model: saved by Blockly, then canonical ids. */
	workspaceJson: Record<string, unknown>;
}

const sha = (value: unknown): string =>
	createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);

/** A hash of the program as written, so a record can say which version of it was zoomed. */
export function programHash(program: CorpusProgram): string {
	return sha({ workspace: program.workspace, blockDefs: program.blockDefs });
}

/**
 * What the plugin and the proxy do to a program before the model sees it:
 * Blockly loads and saves it (so blocks have ids), then the proxy renames ids
 * and drops positions.
 */
export function prepareProgram(program: CorpusProgram): PreparedProgram {
	const saved = saveAsBlockly(
		program.workspace as unknown as Record<string, unknown>,
		program.blockDefs
	);
	return {
		program,
		slug: program.id,
		workspaceJson: normalizeWorkspace(saved).workspaceJson
	};
}

export const snakeSlug = (slug: string): string => toSnakeSlug(slug);
