-- Restores the previous schema. Retired remarks cannot be reconstructed;
-- grades entered since the forward migration will be discarded.
BEGIN IMMEDIATE;
ALTER TABLE `enrollment_subject` ADD COLUMN `remarks` text;
ALTER TABLE `enrollment_subject` DROP COLUMN `grade`;
DELETE FROM `__drizzle_migrations` WHERE `created_at` = 1792004978070;
COMMIT;
