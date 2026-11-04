CREATE TABLE "demo_workspaces" (
	"demo_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"workspace" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_workspaces_demo_id_user_id_pk" PRIMARY KEY("demo_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "demos" ADD COLUMN "starter_kind" text DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE "demos" ADD COLUMN "sample_id" text;--> statement-breakpoint
ALTER TABLE "demos" ADD COLUMN "starter_workspace" jsonb;--> statement-breakpoint
ALTER TABLE "demo_workspaces" ADD CONSTRAINT "demo_workspaces_demo_id_demos_id_fk" FOREIGN KEY ("demo_id") REFERENCES "public"."demos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_workspaces" ADD CONSTRAINT "demo_workspaces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "demos_starter_matches_kind" CHECK (("demos"."starter_kind" = 'sample') = ("demos"."sample_id" IS NOT NULL) AND ("demos"."starter_kind" = 'custom') = ("demos"."starter_workspace" IS NOT NULL));