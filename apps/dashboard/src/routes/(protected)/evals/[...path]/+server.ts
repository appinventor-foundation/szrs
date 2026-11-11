// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getEvalsFiles } from '#lib/server/container.js';
import { NotFoundError } from '#lib/server/errors.js';
import type { RequestHandler } from './$types';

// The evaluation results, for an "Embedded page" demo: the reports that
// `pnpm report` makes in apps/evals/results, their pictures and write-ups.
// Under (protected), so only signed-in people read them. /evals/index.html is
// the front page, and the reports' relative links and pictures work from there.

// The reports are self-contained: one inline script and style, pictures from
// their own folder, nothing from the network. Say so, in case a model's output
// ever got through unescaped.
const REPORT_POLICY =
	"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

export const GET: RequestHandler = async ({ params }) => {
	if (params.path === '') {
		redirect(303, resolve('/(protected)/evals/[...path]', { path: 'index.html' }));
	}
	try {
		const file = await getEvalsFiles().read(params.path);
		const headers: Record<string, string> = {
			'content-type': file.contentType,
			'x-content-type-options': 'nosniff',
			// Signed-in content: no shared caches, and recheck after a new `pnpm report`.
			'cache-control': 'private, no-cache'
		};
		if (file.contentType.startsWith('text/html'))
			headers['content-security-policy'] = REPORT_POLICY;
		return new Response(new Uint8Array(file.body), { headers });
	} catch (cause) {
		if (cause instanceof NotFoundError) error(404, 'Not found');
		throw cause;
	}
};
