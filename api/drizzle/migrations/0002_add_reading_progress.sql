-- Migration 0002: 添加阅读进度、智能文件夹、标注和统计功能

-- 1. 文章表添加阅读进度字段
ALTER TABLE `articles` ADD COLUMN `reading_progress` integer DEFAULT 0;
ALTER TABLE `articles` ADD COLUMN `last_read_position` text;
ALTER TABLE `articles` ADD COLUMN `last_read_at` text;
ALTER TABLE `articles` ADD COLUMN `estimated_read_time` integer;

-- 文章表阅读进度索引
CREATE INDEX `idx_articles_reading_progress` ON `articles`(`reading_progress`);
CREATE INDEX `idx_articles_last_read_at` ON `articles`(`last_read_at`);

-- 2. 创建智能文件夹表
CREATE TABLE `smart_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `color` text DEFAULT '#777777',
  `icon` text,
  `rules` text NOT NULL,
  `sort_order` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now'))
);

CREATE INDEX `idx_smart_folders_user_id` ON `smart_folders`(`user_id`);

-- 3. 创建文章标注/笔记表
CREATE TABLE `annotations` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text NOT NULL REFERENCES `articles`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `content` text NOT NULL,
  `text_range` text,
  `color` text DEFAULT '#FFEB3B',
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now'))
);

CREATE INDEX `idx_annotations_article_id` ON `annotations`(`article_id`);
CREATE INDEX `idx_annotations_user_id` ON `annotations`(`user_id`);

-- 4. 创建阅读统计表
CREATE TABLE `reading_stats` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `date` text NOT NULL,
  `articles_read` integer DEFAULT 0,
  `articles_starred` integer DEFAULT 0,
  `reading_time_minutes` integer DEFAULT 0
);

-- 阅读统计唯一索引（每个用户每天一条记录）
CREATE UNIQUE INDEX `idx_stats_user_date` ON `reading_stats`(`user_id`, `date`);
