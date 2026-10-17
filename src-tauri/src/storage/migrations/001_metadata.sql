CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK(id=1), language TEXT NOT NULL CHECK(language IN ('en','zh-CN')));
CREATE TABLE recent_files (position INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE);
CREATE TABLE workspace_recovery (position INTEGER PRIMARY KEY, document_id TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL UNIQUE, protocol_version INTEGER NOT NULL CHECK(protocol_version=3));
PRAGMA application_id=1112682061;
PRAGMA user_version=1;
