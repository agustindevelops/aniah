CREATE TABLE IF NOT EXISTS sync_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  last_synced_at TEXT,
  last_cursor TEXT,
  last_hash TEXT
);

CREATE TABLE IF NOT EXISTS raw_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  raw_text_hash TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  UNIQUE(source, source_record_id, raw_text_hash)
);

CREATE TABLE IF NOT EXISTS normalized_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_record_id INTEGER NOT NULL UNIQUE,
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  event_date TEXT,
  location TEXT,
  point_of_contact TEXT,
  assigned_staff TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  FOREIGN KEY(raw_record_id) REFERENCES raw_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_record_id INTEGER NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  missing_fields TEXT NOT NULL,
  priority TEXT NOT NULL,
  category TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY(normalized_record_id) REFERENCES normalized_records(id) ON DELETE CASCADE
);
