PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 color TEXT NOT NULL, wake_time TEXT NOT NULL, tz TEXT NOT NULL,
 push_token TEXT, created_at TEXT NOT NULL
);
CREATE TABLE groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE,
 streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE group_members (
 group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL, PRIMARY KEY(group_id,user_id)
);
CREATE TABLE checkins (
 group_id TEXT NOT NULL, user_id TEXT NOT NULL, local_date TEXT NOT NULL,
 checked_at TEXT NOT NULL, PRIMARY KEY(group_id,user_id,local_date),
 FOREIGN KEY(group_id,user_id) REFERENCES group_members(group_id,user_id) ON DELETE CASCADE
);
CREATE TABLE day_results (
 group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 local_date TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('kept','broken')),
 late_user_ids TEXT NOT NULL, PRIMARY KEY(group_id,local_date)
);
CREATE INDEX checkins_user_date ON checkins(user_id,local_date);
CREATE INDEX day_results_date ON day_results(local_date);
CREATE TRIGGER group_members_limit BEFORE INSERT ON group_members
WHEN (SELECT COUNT(*) FROM group_members WHERE group_id=NEW.group_id) >= 6
BEGIN SELECT RAISE(ABORT, 'group_full'); END;
