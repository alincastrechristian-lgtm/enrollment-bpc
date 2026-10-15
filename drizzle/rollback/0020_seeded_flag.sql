-- Reverting removes the completion marker, so older startup code will seed again.
BEGIN IMMEDIATE;
ALTER TABLE `system_settings` DROP COLUMN `seeded`;
DELETE FROM `__drizzle_migrations` WHERE `created_at` = 1792063412700;
COMMIT;
