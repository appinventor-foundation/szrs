import { z } from 'zod';

export const ModelsResponseSchema = z.object({
	models: z.array(z.string())
});
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;
