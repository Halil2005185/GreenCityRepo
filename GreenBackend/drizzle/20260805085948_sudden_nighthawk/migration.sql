CREATE TABLE "app_metadata" (
	"key" varchar(100) PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
