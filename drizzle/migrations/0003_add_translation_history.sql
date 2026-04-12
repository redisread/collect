-- Migration: Add translation_history table
CREATE TABLE IF NOT EXISTS translation_history (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    article_id TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    source_lang TEXT DEFAULT 'auto',
    article_title TEXT,
    feed_name TEXT,
    translated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_translation_history_user_id ON translation_history(user_id);
CREATE INDEX idx_translation_history_translated_at ON translation_history(translated_at);
CREATE INDEX idx_translation_history_user_article ON translation_history(user_id, article_id);
