// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { z } from 'zod';

// Plain Zod, safe for the browser. server/db/schema/auth.test.ts checks the
// record shape against the user table.
export const ROLES = ['admin', 'user'] as const;

export const roleSchema = z.enum(ROLES);
export const userIdSchema = z.string().min(1);

export const passwordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.max(128, 'Password must be at most 128 characters');

export const userRecordSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	role: z.string(),
	banned: z.boolean(),
	banReason: z.string().nullable(),
	banExpires: z.date().nullable(),
	createdAt: z.date()
});

export const createUserInputSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
	email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
	password: passwordSchema,
	role: roleSchema.default('user')
});

export const setRoleFormSchema = z.object({ role: roleSchema });
export const setPasswordFormSchema = z.object({ password: passwordSchema });
export const banFormSchema = z.object({
	reason: z
		.string()
		.trim()
		.max(200, 'Reason is too long')
		.transform((value) => (value === '' ? undefined : value))
		.optional()
});

export type Role = z.infer<typeof roleSchema>;
export type UserRecord = z.infer<typeof userRecordSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
