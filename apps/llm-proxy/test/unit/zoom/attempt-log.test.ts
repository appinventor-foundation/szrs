// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { describe, expect, it, vi } from 'vitest';

import {
	classifyError,
	logAttempt,
	traceMetadata,
	truncationMessage
} from '../../../src/zoom/attempt-log.js';
import { parseZoomResponse, ZoomOutputError } from '../../../src/zoom/zoom.js';

describe('classifyError', () => {
	it('tells apart text that is not JSON, a wrong shape and a mismatch with Detail', () => {
		expect(classifyError(new SyntaxError('x'))).toBe('parse');
		expect(classifyError(new ZoomOutputError('schema', 'x'))).toBe('schema');
		expect(classifyError(new ZoomOutputError('validation', 'x'))).toBe('validation');
		expect(classifyError(new Error('x'))).toBe('other');
	});

	it('classifies what parseZoomResponse throws', () => {
		const level = (type: string) => ({
			blockDefs: [{ type, message0: 'x' }],
			workspaceJson: { blocks: { languageVersion: 0, blocks: [] } },
			bindings: []
		});
		const binding = { block: 's1', field: 'N', detail: [{ block: 'd1', field: 'NUM' }] };
		const text = (value: unknown) => JSON.stringify(value);
		const classify = (value: string) => {
			try {
				parseZoomResponse(value, {});
			} catch (error) {
				return classifyError(error);
			}
			return 'ok';
		};

		expect(classify('{ nope')).toBe('parse');
		expect(classify(text({ semantic: level('zoom_a') }))).toBe('schema');
		expect(
			classify(
				text({
					semantic: { ...level('zoom_a'), bindings: [binding] },
					concept: level('zoom_b')
				})
			)
		).toBe('validation');
	});
});

describe('truncationMessage', () => {
	it('names the token count when known', () => {
		expect(truncationMessage(8192)).toContain('cut off at 8192 tokens');
		expect(truncationMessage(undefined)).toContain('cut off,');
	});
});

describe('traceMetadata', () => {
	it('carries the prompt id as a field and a tag', () => {
		expect(traceMetadata('v1')).toEqual({ prompt_id: 'v1', tags: ['zoom', 'zoom-prompt:v1'] });
	});
});

describe('logAttempt', () => {
	it('logs the record as one structured entry', () => {
		const log = { info: vi.fn() };
		const record = {
			promptId: 'v0',
			model: 'm',
			attempt: 1,
			outcome: 'ok' as const,
			repairs: [],
			latencyMs: 5
		};

		logAttempt(log as never, record);

		expect(log.info).toHaveBeenCalledWith(record, 'zoom attempt');
	});
});
