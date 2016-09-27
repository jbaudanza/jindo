DROP TABLE events;

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  actor JSONB,
  timestamp TIMESTAMP,
  ip_address INET,
  key TEXT,
  process_id UUID,
  session_id UUID,
  connection_id INTEGER,
  data JSONB NOT NULL
);

CREATE INDEX key_index ON events (key);

DROP TABLE key_values;

CREATE TABLE key_values (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
)