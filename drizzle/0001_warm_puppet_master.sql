CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`max_uses` integer NOT NULL,
	`infinity_max_uses` integer DEFAULT false NOT NULL,
	`created_by_user_id` text NOT NULL,
	`redirect_to_after_upgrade` text,
	`share_inviter_name` integer NOT NULL,
	`email` text,
	`emails` text,
	`role` text NOT NULL,
	`new_account` integer,
	`status` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_unique` ON `invite` (`token`);--> statement-breakpoint
CREATE TABLE `invite_use` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_id` text NOT NULL,
	`used_at` integer NOT NULL,
	`used_by_user_id` text,
	FOREIGN KEY (`invite_id`) REFERENCES `invite`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
