CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email_digest_enabled` integer DEFAULT false,
	`email_digest_frequency` text DEFAULT 'daily',
	`email_digest_time` text DEFAULT '09:00',
	`email_digest_day` integer DEFAULT 1,
	`last_digest_sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#777777',
	`icon` text,
	`sort_order` integer DEFAULT 0,
	`is_collapsed` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_folders_user_id` ON `folders` (`user_id`);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`folder_id` text,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`feed_url` text NOT NULL,
	`description` text,
	`favicon_url` text,
	`health_status` text DEFAULT 'healthy',
	`consecutive_errors` integer DEFAULT 0,
	`last_error_message` text,
	`last_error_at` text,
	`last_etag` text,
	`last_modified` text,
	`content_hash` text,
	`next_fetch_at` text,
	`fetch_interval_minutes` integer DEFAULT 60,
	`cached_article_count` integer DEFAULT 0,
	`cached_unread_count` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`last_fetched_at` text,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feeds_url_user` ON `feeds` (`url`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_feeds_folder_id` ON `feeds` (`folder_id`);
--> statement-breakpoint
CREATE INDEX `idx_feeds_user_id` ON `feeds` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_feeds_health_status` ON `feeds` (`health_status`);
--> statement-breakpoint
CREATE INDEX `idx_feeds_next_fetch_at` ON `feeds` (`next_fetch_at`);
--> statement-breakpoint
CREATE INDEX `idx_feeds_active` ON `feeds` (`is_active`);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feed_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`content` text,
	`content_text` text,
	`summary` text,
	`author` text,
	`image_url` text,
	`published_at` text,
	`is_read` integer DEFAULT false,
	`is_starred` integer DEFAULT false,
	`is_read_later` integer DEFAULT false,
	`is_extracted` integer DEFAULT false,
	`extracted_at` text,
	`reading_progress` integer DEFAULT 0,
	`last_read_position` text,
	`last_read_at` text,
	`estimated_read_time` integer,
	`retention_date` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_articles_feed_id` ON `articles` (`feed_id`);
--> statement-breakpoint
CREATE INDEX `idx_articles_user_id` ON `articles` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_articles_published_at` ON `articles` (`published_at`);
--> statement-breakpoint
CREATE INDEX `idx_articles_is_starred` ON `articles` (`is_starred`);
--> statement-breakpoint
CREATE INDEX `idx_articles_is_read_later` ON `articles` (`is_read_later`);
--> statement-breakpoint
CREATE INDEX `idx_articles_reading_progress` ON `articles` (`reading_progress`);
--> statement-breakpoint
CREATE INDEX `idx_articles_last_read_at` ON `articles` (`last_read_at`);
--> statement-breakpoint
CREATE INDEX `idx_articles_user_published` ON `articles` (`user_id`,`published_at`);
--> statement-breakpoint
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
CREATE INDEX `idx_smart_folders_user_id` ON `smart_folders` (`user_id`);
--> statement-breakpoint
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
CREATE INDEX `idx_annotations_article_id` ON `annotations` (`article_id`);
--> statement-breakpoint
CREATE INDEX `idx_annotations_user_id` ON `annotations` (`user_id`);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_stats_user_date` ON `reading_stats` (`user_id`,`date`);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`max_articles_per_feed` integer DEFAULT 100,
	`article_retention_days` integer DEFAULT 30,
	`default_view` text DEFAULT 'all',
	`refresh_interval_minutes` integer DEFAULT 30,
	`theme` text DEFAULT 'system',
	`font_size` integer DEFAULT 16,
	`show_images` integer DEFAULT true,
	`auto_mark_as_read` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_prefs_user_id` ON `user_preferences` (`user_id`);
--> statement-breakpoint
CREATE TABLE `fetch_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 5,
	`retry_count` integer DEFAULT 0,
	`scheduled_at` text DEFAULT (datetime('now')),
	`started_at` text,
	`completed_at` text,
	`error_message` text,
	`result` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_queue_status` ON `fetch_queue` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_queue_scheduled` ON `fetch_queue` (`scheduled_at`);
--> statement-breakpoint
CREATE INDEX `idx_queue_feed` ON `fetch_queue` (`feed_id`);
--> statement-breakpoint
CREATE INDEX `idx_queue_status_scheduled` ON `fetch_queue` (`status`,`scheduled_at`);
--> statement-breakpoint
CREATE TABLE `sync_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text,
	`last_sync_at` text,
	`last_article_id` text,
	`last_feed_id` text,
	`sync_version` integer DEFAULT 1,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_states_user_device` ON `sync_states` (`user_id`,`device_id`);
--> statement-breakpoint
CREATE TABLE `translation_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`target_lang` text NOT NULL,
	`source_lang` text DEFAULT 'auto',
	`article_title` text,
	`feed_name` text,
	`translated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_translation_history_user_id` ON `translation_history` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_translation_history_translated_at` ON `translation_history` (`translated_at`);
--> statement-breakpoint
CREATE INDEX `idx_translation_history_user_article` ON `translation_history` (`user_id`,`article_id`);
