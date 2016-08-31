DROP TABLE events;

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  actor JSONB,
  timestamp TIMESTAMP,
  ip_address INET,
  name TEXT,
  process_id UUID,
  session_id UUID,
  connection_id INTEGER,
  data JSONB NOT NULL
);

CREATE INDEX name_index ON events (name);
