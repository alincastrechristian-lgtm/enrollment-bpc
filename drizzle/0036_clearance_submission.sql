CREATE TABLE `clearance_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`template_revision` text NOT NULL,
	`definition` text NOT NULL,
	`corners` text NOT NULL,
	`report` text NOT NULL,
	`status` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`requested_at` integer,
	`reviewed_at` integer,
	`reviewed_by` text,
	`reviewer_name` text,
	`rejection_reason` text,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "clearance_submission_status_valid" CHECK("clearance_submission"."status" IN ('ready','requested','verified','rejected','invalidated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clearance_submission_enrollment_id_unique` ON `clearance_submission` (`enrollment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clearance_submission_object_key_unique` ON `clearance_submission` (`object_key`);
