import { z } from 'zod';

export const ErrorEnvelopeSchema = z.object({
	error: z.object({
		message: z.string(),
		code: z.string()
	})
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
