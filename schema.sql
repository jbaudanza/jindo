DROP TABLE events;

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  actor JSONB,
  timestamp TIMESTAMP,
  ip_address INET,
  name TEXT,
  origin TEXT,
  process_id UUID,
  data JSONB NOT NULL
);

CREATE INDEX origin_index ON events (origin);
