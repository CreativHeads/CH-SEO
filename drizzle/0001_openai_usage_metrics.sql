ALTER TABLE `usage_log` ADD `model` text;
--> statement-breakpoint
ALTER TABLE `usage_log` ADD `input_tokens` integer;
--> statement-breakpoint
ALTER TABLE `usage_log` ADD `output_tokens` integer;
--> statement-breakpoint
ALTER TABLE `usage_log` ADD `cached_input_tokens` integer;
