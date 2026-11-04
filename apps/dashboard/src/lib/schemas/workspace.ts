// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

import { z } from 'zod';

// A Blockly workspace as `Blockly.serialization.workspaces.save` returns it.
// Deliberately opaque: we check it is a JSON object of sane size, not Blockly's
// shape, so a Blockly upgrade never invalidates stored workspaces.
export const WORKSPACE_MAX_BYTES = 512_000;

export const workspaceSchema = z
	.record(z.string(), z.unknown())
	.refine((workspace) => JSON.stringify(workspace).length <= WORKSPACE_MAX_BYTES, {
		message: 'Workspace is too large'
	});

export type Workspace = z.infer<typeof workspaceSchema>;

// A form posts the workspace as a JSON string.
export const workspaceFormSchema = z.object({
	workspace: z
		.string()
		.transform((raw, ctx) => {
			try {
				return JSON.parse(raw) as unknown;
			} catch {
				ctx.issues.push({ code: 'custom', message: 'Workspace is not valid JSON', input: raw });
				return z.NEVER;
			}
		})
		.pipe(workspaceSchema)
});
