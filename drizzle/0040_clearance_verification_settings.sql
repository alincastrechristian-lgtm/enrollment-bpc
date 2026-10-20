ALTER TABLE `enrollment` ADD `manual_clearance_verified_at` integer;--> statement-breakpoint
ALTER TABLE `enrollment` ADD `manual_clearance_verified_by` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `enrollment` ADD `manual_clearance_verifier_name` text;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `gemini_api_key` text;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `automated_clearance_verification_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `personal_info_verification_enabled` integer DEFAULT true NOT NULL;