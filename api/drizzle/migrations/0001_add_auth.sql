-- Better Auth 四张表
CREATE TABLE IF NOT EXISTS `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL UNIQUE,
  `email_verified` integer NOT NULL DEFAULT 0,
  `image` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL,
  `token` text NOT NULL UNIQUE,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `account` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `access_token` text,
  `refresh_token` text,
  `id_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `password` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer,
  `updated_at` integer
);

-- 现有表加 user_id 字段（如果还没有）
ALTER TABLE `folders` ADD COLUMN `user_id` text NOT NULL DEFAULT '' REFERENCES `user`(`id`) ON DELETE CASCADE;
ALTER TABLE `feeds` ADD COLUMN `user_id` text NOT NULL DEFAULT '' REFERENCES `user`(`id`) ON DELETE CASCADE;

-- feeds.url 改为用户维度唯一（移除旧的全局唯一索引，创建复合唯一索引）
DROP INDEX IF EXISTS `feeds_url_unique`;
CREATE UNIQUE INDEX IF NOT EXISTS `idx_feeds_url_user` ON `feeds`(`url`, `user_id`);

-- 辅助索引
CREATE INDEX IF NOT EXISTS `idx_folders_user_id` ON `folders`(`user_id`);
CREATE INDEX IF NOT EXISTS `idx_feeds_user_id` ON `feeds`(`user_id`);
