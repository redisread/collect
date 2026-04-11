-- 架构重构迁移
-- 1. 添加文章表 user_id 字段（冗余存储，优化查询）
-- 2. 添加订阅源健康度和抓取配置字段
-- 3. 创建抓取任务队列表
-- 4. 创建用户偏好设置表
-- 5. 创建同步状态表
-- 6. 添加优化索引

-- ============================================
-- 1. 修改文章表：添加 user_id 字段
-- ============================================

-- 添加 user_id 字段（先允许NULL，迁移数据后再设为NOT NULL）
ALTER TABLE articles ADD COLUMN user_id TEXT REFERENCES user(id) ON DELETE CASCADE;
ALTER TABLE articles ADD COLUMN content_text TEXT;
ALTER TABLE articles ADD COLUMN read_at TEXT;
ALTER TABLE articles ADD COLUMN is_content_fetched INTEGER DEFAULT 0;
ALTER TABLE articles ADD COLUMN content_fetched_at TEXT;
ALTER TABLE articles ADD COLUMN retention_date TEXT;

-- 迁移数据：从feeds表关联填充user_id
UPDATE articles SET user_id = (
    SELECT user_id FROM feeds WHERE feeds.id = articles.feed_id
);

-- 创建文章表新索引
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_user_feed ON articles(user_id, feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_user_published ON articles(user_id, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_user_read ON articles(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_articles_user_starred ON articles(user_id, is_starred);
CREATE INDEX IF NOT EXISTS idx_articles_user_read_later ON articles(user_id, is_read_later);
CREATE INDEX IF NOT EXISTS idx_articles_retention ON articles(retention_date);

-- ============================================
-- 2. 修改订阅源表：添加健康度和抓取配置
-- ============================================

ALTER TABLE feeds ADD COLUMN fetch_interval_minutes INTEGER DEFAULT 60;
ALTER TABLE feeds ADD COLUMN next_fetch_at TEXT;
ALTER TABLE feeds ADD COLUMN health_status TEXT DEFAULT 'healthy';
ALTER TABLE feeds ADD COLUMN consecutive_errors INTEGER DEFAULT 0;
ALTER TABLE feeds ADD COLUMN last_error_message TEXT;
ALTER TABLE feeds ADD COLUMN last_error_at TEXT;
ALTER TABLE feeds ADD COLUMN last_etag TEXT;
ALTER TABLE feeds ADD COLUMN last_modified TEXT;
ALTER TABLE feeds ADD COLUMN content_hash TEXT;
ALTER TABLE feeds ADD COLUMN cached_article_count INTEGER DEFAULT 0;
ALTER TABLE feeds ADD COLUMN cached_unread_count INTEGER DEFAULT 0;
ALTER TABLE feeds ADD COLUMN is_active INTEGER DEFAULT 1;

-- 计算初始的 next_fetch_at
UPDATE feeds SET next_fetch_at = datetime(last_fetched_at, '+' || fetch_interval_minutes || ' minutes')
WHERE last_fetched_at IS NOT NULL;

UPDATE feeds SET next_fetch_at = datetime('now') WHERE next_fetch_at IS NULL;

-- 创建订阅源表新索引
CREATE INDEX IF NOT EXISTS idx_feeds_next_fetch ON feeds(next_fetch_at, is_active);
CREATE INDEX IF NOT EXISTS idx_feeds_health ON feeds(health_status);

-- ============================================
-- 3. 修改文件夹表：添加统计缓存
-- ============================================

ALTER TABLE folders ADD COLUMN cached_feed_count INTEGER DEFAULT 0;
ALTER TABLE folders ADD COLUMN cached_unread_count INTEGER DEFAULT 0;

-- ============================================
-- 4. 创建抓取任务队列表
-- ============================================

CREATE TABLE IF NOT EXISTS fetch_queue (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    scheduled_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    result TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status_scheduled ON fetch_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_queue_feed ON fetch_queue(feed_id);
CREATE INDEX IF NOT EXISTS idx_queue_user ON fetch_queue(user_id);

-- ============================================
-- 5. 创建用户偏好设置表
-- ============================================

CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
    default_view TEXT DEFAULT 'unread',
    articles_per_page INTEGER DEFAULT 30,
    mark_read_on_scroll INTEGER DEFAULT 0,
    show_thumbnails INTEGER DEFAULT 1,
    article_retention_days INTEGER DEFAULT 30,
    max_articles_per_feed INTEGER DEFAULT 100,
    email_digest_enabled INTEGER DEFAULT 0,
    email_digest_frequency TEXT DEFAULT 'daily',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 为现有用户创建默认偏好
INSERT INTO user_preferences (user_id, default_view, articles_per_page)
SELECT id, 'unread', 30 FROM user
WHERE id NOT IN (SELECT user_id FROM user_preferences);

-- ============================================
-- 6. 创建同步状态表
-- ============================================

CREATE TABLE IF NOT EXISTS sync_states (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    last_sync_at TEXT NOT NULL,
    sync_token TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_user_device ON sync_states(user_id, device_id);
