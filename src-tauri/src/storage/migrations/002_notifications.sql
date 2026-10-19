CREATE TABLE notification_preferences (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
INSERT INTO notification_preferences (id,enabled) VALUES (1,0);
