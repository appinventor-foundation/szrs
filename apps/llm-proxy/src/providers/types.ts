export interface ChatCompletionParams {
	model: string;
	messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
	temperature?: number;
	maxTokens?: number;
}

export interface ChatCompletionResult {
	content: string;
	model: string;
	usage: { promptTokens: number; completionTokens: number; totalTokens: number };
	finishReason: string;
}

export interface Provider {
	readonly id: string;
	chat(params: ChatCompletionParams): Promise<ChatCompletionResult>;
}
