-- Seed data for local development

-- 1. 创建测试用户 (密码: password123)
-- 密码哈希使用 bcrypt: $2a$10$abcdefghijklmnopqrstuvwxycdefghijklmnopqrstu
INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`) VALUES
('user_001', 'Test User', 'test@example.com', 1, NULL, 1700000000000, 1700000000000),
('user_002', 'Demo User', 'demo@example.com', 1, NULL, 1700000000001, 1700000000001);

-- 2. 创建文件夹
INSERT INTO `folders` (`id`, `name`, `color`, `icon`, `sort_order`, `is_collapsed`, `created_at`, `updated_at`, `user_id`) VALUES
('folder_001', 'Technology', '#3B82F6', '💻', 1, 0, datetime('now'), datetime('now'), 'user_001'),
('folder_002', 'News', '#EF4444', '📰', 2, 0, datetime('now'), datetime('now'), 'user_001'),
('folder_003', 'Design', '#8B5CF6', '🎨', 3, 0, datetime('now'), datetime('now'), 'user_001'),
('folder_004', 'Personal', '#10B981', '📌', 4, 0, datetime('now'), datetime('now'), 'user_002');

-- 3. 创建 RSS 订阅源
INSERT INTO `feeds` (`id`, `folder_id`, `title`, `url`, `feed_url`, `description`, `favicon_url`, `last_fetched_at`, `sort_order`, `created_at`, `updated_at`, `user_id`) VALUES
('feed_001', 'folder_001', 'TechCrunch', 'https://techcrunch.com', 'https://techcrunch.com/feed/', 'Startup and Technology News', 'https://techcrunch.com/favicon.ico', datetime('now'), 1, datetime('now'), datetime('now'), 'user_001'),
('feed_002', 'folder_001', 'The Verge', 'https://www.theverge.com', 'https://www.theverge.com/rss/index.xml', 'Technology and Culture News', 'https://www.theverge.com/favicon.ico', datetime('now'), 2, datetime('now'), datetime('now'), 'user_001'),
('feed_003', 'folder_001', 'Hacker News', 'https://news.ycombinator.com', 'https://news.ycombinator.com/rss', 'Tech News Aggregator', NULL, datetime('now'), 3, datetime('now'), datetime('now'), 'user_001'),
('feed_004', 'folder_002', 'BBC News', 'https://www.bbc.com/news', 'http://feeds.bbci.co.uk/news/rss.xml', 'World News from BBC', 'https://www.bbc.com/favicon.ico', datetime('now'), 1, datetime('now'), datetime('now'), 'user_001'),
('feed_005', 'folder_002', 'Reuters', 'https://www.reuters.com', 'https://www.reutersagency.com/feed/?taxonomy=markets&post_type=reuters-best', 'Global Business News', NULL, datetime('now'), 2, datetime('now'), datetime('now'), 'user_001'),
('feed_006', 'folder_003', 'Dribbble', 'https://dribbble.com', 'https://dribbble.com/shots/popular/rss', 'Design Inspiration', 'https://dribbble.com/favicon.ico', datetime('now'), 1, datetime('now'), datetime('now'), 'user_001'),
('feed_007', 'folder_004', 'Personal Blog', 'https://example.com/blog', 'https://example.com/blog/feed.xml', 'My personal thoughts', NULL, datetime('now'), 1, datetime('now'), datetime('now'), 'user_002');

-- 4. 创建文章数据
INSERT INTO `articles` (`id`, `feed_id`, `title`, `url`, `content`, `summary`, `author`, `image_url`, `published_at`, `is_read`, `is_starred`, `is_read_later`, `created_at`) VALUES
('article_001', 'feed_001', 'AI Revolution Continues with New Breakthroughs', 'https://techcrunch.com/2024/01/15/ai-revolution/', '<p>Artificial intelligence continues to transform industries across the globe...</p>', 'Latest developments in AI technology are reshaping how we work', 'John Smith', 'https://example.com/image1.jpg', datetime('now', '-2 days'), 0, 1, 0, datetime('now')),
('article_002', 'feed_001', 'Startup Funding Hits Record High', 'https://techcrunch.com/2024/01/14/startup-funding/', '<p>Venture capital investments have reached unprecedented levels this quarter...</p>', 'VC investments surge in Q1 2024', 'Jane Doe', NULL, datetime('now', '-3 days'), 1, 0, 0, datetime('now')),
('article_003', 'feed_002', 'The Future of Smartphones', 'https://www.theverge.com/2024/01/15/smartphone-future/', '<p>What will smartphones look like in 2030? We explore the possibilities...</p>', 'A look ahead at mobile technology', 'Mike Johnson', 'https://example.com/image2.jpg', datetime('now', '-1 day'), 0, 0, 1, datetime('now')),
('article_004', 'feed_002', 'Review: Latest Gaming Console', 'https://www.theverge.com/2024/01/13/console-review/', '<p>We spent 30 days with the new gaming console. Here is what we found...</p>', 'In-depth review of the newest gaming hardware', 'Sarah Chen', NULL, datetime('now', '-4 days'), 1, 1, 0, datetime('now')),
('article_005', 'feed_003', 'Show HN: I built a new RSS reader', 'https://news.ycombinator.com/item?id=12345', '<p>After years of using existing solutions, I decided to build my own...</p>', 'A new open source RSS reader', 'dev_user', NULL, datetime('now', '-5 hours'), 0, 0, 0, datetime('now')),
('article_006', 'feed_004', 'Global Climate Summit Reaches Agreement', 'https://www.bbc.com/news/climate-summit-2024', '<p>World leaders have reached a historic agreement on climate action...</p>', 'Major breakthrough at international climate conference', 'BBC Staff', 'https://example.com/climate.jpg', datetime('now', '-12 hours'), 0, 0, 1, datetime('now')),
('article_007', 'feed_004', 'Technology Sector Shows Strong Growth', 'https://www.bbc.com/news/tech-growth-2024', '<p>Tech companies report better than expected earnings this quarter...</p>', 'Positive trends in technology markets', 'Tom Wilson', NULL, datetime('now', '-1 day'), 1, 0, 0, datetime('now')),
('article_008', 'feed_006', '10 Design Trends for 2024', 'https://dribbble.com/shots/trends-2024', '<p>From minimalism to maximalism, we explore the design trends shaping this year...</p>', 'Visual design trends to watch', 'Lisa Park', 'https://example.com/design.jpg', datetime('now', '-2 days'), 0, 1, 1, datetime('now')),
('article_009', 'feed_007', 'My Journey into Digital Gardening', 'https://example.com/blog/digital-gardening', '<p>How I started cultivating my own corner of the internet...</p>', 'Thoughts on personal knowledge management', 'Demo User', NULL, datetime('now', '-3 days'), 0, 0, 0, datetime('now'));
