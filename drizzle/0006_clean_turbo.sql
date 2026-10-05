CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`smtp_host` text DEFAULT 'smtp.gmail.com',
	`smtp_port` integer DEFAULT 465,
	`sender_email` text,
	`sender_name` text DEFAULT 'BPC Enrollment System',
	`sender_password` text
);
