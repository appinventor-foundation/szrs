// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { sql } from 'drizzle-orm';
import type { Database } from '#lib/server/db/client.js';

export async function isDatabaseHealthy(db: Database): Promise<boolean> {
	try {
		await db.execute(sql`select 1`);
		return true;
	} catch {
		return false;
	}
}
