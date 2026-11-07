// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import type { EvalRecord } from '../baseline/record.js';

/** Which stored runs to draw by default: the programs and models the user chose on 2026-11-07. */
export const DEFAULT_PROGRAMS = [
	'fizzbuzz',
	'dice-game',
	'bank-account',
	'three-programs',
	'tic-tac-toe'
];
export const DEFAULT_MODELS = [
	'claude-haiku-5.5',
	'gemini-3.5-flash-lite',
	'glm-5.3-flash',
	'gemma-4-26b-a4b-it',
	'qwen3-coder-next'
];
export const DEFAULT_PROMPTS = ['v0', 'v1'];

export type LevelName = 'semantic' | 'concept';

/** The file names a screenshot gets. They are what the gallery links to, so they stay plain. */
export const detailFile = (program: string): string => `${program}__detail.png`;
export const levelFile = (
	program: string,
	model: string,
	prompt: string,
	level: LevelName
): string => `${program}__${model}__${prompt}__${level}.png`;

/**
 * The stored runs for every program, model and prompt asked for, in that order
 * (program, then model, then prompt). A combination with no stored run is an
 * error, so a typo in a name does not quietly give a smaller gallery.
 */
export function selectRecords(
	records: EvalRecord[],
	programs: string[],
	models: string[],
	prompts: string[]
): EvalRecord[] {
	const selected: EvalRecord[] = [];
	const missing: string[] = [];
	for (const program of programs) {
		for (const model of models) {
			for (const prompt of prompts) {
				const found = records.find(
					(record) =>
						record.program.id === program &&
						record.model.id === model &&
						record.prompt.id === prompt &&
						record.sample === 1
				);
				if (found) selected.push(found);
				else missing.push(`${program} / ${model} / ${prompt}`);
			}
		}
	}
	if (missing.length > 0) {
		throw new Error(`no stored run for: ${missing.join('; ')}`);
	}
	return selected;
}
