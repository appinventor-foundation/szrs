// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { z } from 'zod';

export const signInSchema = z.object({
	email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
	password: z.string().min(1, 'Password is required'),
	redirectTo: z.string().optional()
});

export type SignInInput = z.infer<typeof signInSchema>;
