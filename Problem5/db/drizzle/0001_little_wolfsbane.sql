CREATE TABLE "iam"."offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offices_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "iam"."user_offices" (
	"user_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_offices_user_id_office_id_pk" PRIMARY KEY("user_id","office_id")
);
--> statement-breakpoint
ALTER TABLE "iam"."user_offices" ADD CONSTRAINT "user_offices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_offices" ADD CONSTRAINT "user_offices_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "iam"."offices"("id") ON DELETE cascade ON UPDATE no action;