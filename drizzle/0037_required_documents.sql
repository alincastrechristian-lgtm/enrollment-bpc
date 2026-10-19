CREATE TABLE `required_document` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`requested_enrollment_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`due_year_level` integer NOT NULL,
	`due_semester` integer NOT NULL,
	`requested_by` text,
	`requested_at` integer NOT NULL,
	`object_key` text,
	`filename` text,
	`content_type` text,
	`size` integer,
	`uploaded_at` integer,
	`reviewed_by` text,
	`reviewer_name` text,
	`reviewed_at` integer,
	`rejection_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "required_document_kind_valid" CHECK("required_document"."kind" IN ('form137','sf10','tor')),
	CONSTRAINT "required_document_status_valid" CHECK("required_document"."status" IN ('requested','uploaded','verified','rejected')),
	CONSTRAINT "required_document_revision_valid" CHECK("required_document"."revision" >= 0),
	CONSTRAINT "required_document_file_valid" CHECK(("required_document"."status" = 'requested' AND "required_document"."object_key" IS NULL) OR ("required_document"."status" != 'requested' AND "required_document"."object_key" IS NOT NULL AND "required_document"."filename" IS NOT NULL AND "required_document"."content_type" IS NOT NULL AND "required_document"."size" > 0 AND "required_document"."uploaded_at" IS NOT NULL)),
	CONSTRAINT "required_document_due_valid" CHECK("required_document"."due_year_level" > 0 AND "required_document"."due_semester" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `required_document_object_key_unique` ON `required_document` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `required_document_user_kind_unique` ON `required_document` (`user_id`,`kind`);