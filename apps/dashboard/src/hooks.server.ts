// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { sequence } from '@sveltejs/kit/hooks';
import { authHandle, guardHandle, sessionHandle } from '#lib/server/auth/hooks.js';

export const handle = sequence(sessionHandle, guardHandle, authHandle);
