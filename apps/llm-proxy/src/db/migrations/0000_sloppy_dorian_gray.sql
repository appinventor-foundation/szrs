CREATE TABLE "request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"status_code" integer NOT NULL,
	"error_message" text
);
