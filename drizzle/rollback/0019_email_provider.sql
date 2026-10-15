-- Run only after backing up Resend credentials and switching the application to SMTP.
-- Removes the provider selection and Resend key; existing SMTP settings remain intact.
BEGIN IMMEDIATE;
ALTER TABLE `system_settings` DROP COLUMN `resend_api_key`;
ALTER TABLE `system_settings` DROP COLUMN `email_api_type`;
DELETE FROM `__drizzle_migrations` WHERE `created_at` = 1792059407843;
COMMIT;
