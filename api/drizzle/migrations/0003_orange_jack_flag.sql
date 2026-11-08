CREATE TABLE `ai_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`revision` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_profiles_user` ON `ai_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `ai_translation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`revision` text NOT NULL,
	`target_lang` text NOT NULL,
	`content_hash` text NOT NULL,
	`plan` text NOT NULL,
	`results` text DEFAULT '[]' NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `ai_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_translation_jobs_user_article` ON `ai_translation_jobs` (`user_id`,`article_id`);--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `translation_provider_id` text;