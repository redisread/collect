CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`text_range` text,
	`color` text DEFAULT '#FFEB3B',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_article_id` ON `annotations` (`article_id`);--> statement-breakpoint
CREATE INDEX `idx_annotations_user_id` ON `annotations` (`user_id`);--> statement-breakpoint
CREATE TABLE `reading_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`articles_read` integer DEFAULT 0,
	`articles_starred` integer DEFAULT 0,
	`reading_time_minutes` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stats_user_date` ON `reading_stats` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `smart_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#777777',
	`icon` text,
	`rules` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_smart_folders_user_id` ON `smart_folders` (`user_id`);--> statement-breakpoint
ALTER TABLE `articles` ADD `reading_progress` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `articles` ADD `last_read_position` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `last_read_at` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `estimated_read_time` integer;--> statement-breakpoint
CREATE INDEX `idx_articles_reading_progress` ON `articles` (`reading_progress`);--> statement-breakpoint
CREATE INDEX `idx_articles_last_read_at` ON `articles` (`last_read_at`);--> statement-breakpoint
ALTER TABLE `user` ADD `email_digest_enabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `email_digest_frequency` text DEFAULT 'daily';--> statement-breakpoint
ALTER TABLE `user` ADD `email_digest_time` text DEFAULT '09:00';--> statement-breakpoint
ALTER TABLE `user` ADD `email_digest_day` integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE `user` ADD `last_digest_sent_at` text;