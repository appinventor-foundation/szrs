// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { isRecord } from './html.js';
import type { ResultRow } from './rows.js';

export type Identity = Pick<ResultRow, 'model' | 'provider' | 'vendor' | 'alias'>;

/**
 * The model an alias resolved to, as the run recorded it in the `models` block
 * of its results. A result without that record can only show the alias.
 */
export function identityOf(json: Record<string, unknown>, alias: string): Identity {
	const models = isRecord(json.models) ? json.models : {};
	const found = models[alias];
	if (!isRecord(found) || typeof found.model !== 'string') return { model: alias, alias };
	return {
		model: found.model,
		provider: typeof found.provider === 'string' ? found.provider : undefined,
		vendor: typeof found.vendor === 'string' ? found.vendor : undefined,
		alias
	};
}
