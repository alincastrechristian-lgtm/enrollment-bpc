ALTER TABLE `system_settings` ADD `ai_provider` text DEFAULT 'gemini' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `openai_api_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `openai_model` text DEFAULT 'gpt-4.1-mini' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ollama_base_url` text DEFAULT 'http://localhost:11434' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ollama_model` text DEFAULT 'qwen3-vl:4b' NOT NULL;