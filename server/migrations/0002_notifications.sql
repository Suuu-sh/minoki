CREATE TABLE notification_log (
 group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 local_date TEXT NOT NULL,
 kind TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sent_at TEXT NOT NULL,
 PRIMARY KEY(group_id,local_date,kind,user_id)
);
