CREATE TABLE `garage_storage` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`key_name` text NOT NULL,
	`access_key_id` text,
	`lease_token` text,
	`lease_expires_at` integer DEFAULT 0 NOT NULL
);
