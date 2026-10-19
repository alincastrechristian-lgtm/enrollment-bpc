CREATE TABLE `clearance_template` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`revision` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "clearance_template_singleton" CHECK("clearance_template"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clearance_template_object_key_unique` ON `clearance_template` (`object_key`);