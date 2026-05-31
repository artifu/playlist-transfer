create table if not exists transfers (
  id text primary key,
  session_id text not null,
  status text not null,
  input text not null,
  analysis_limit integer not null,
  analysis_json text not null,
  created_apple_playlist_id text,
  created_from_confidence_threshold real,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_transfers_updated_at on transfers (updated_at);
create index if not exists idx_transfers_session_updated_at on transfers (session_id, updated_at);

create table if not exists jobs (
  id text primary key,
  session_id text not null,
  kind text not null,
  status text not null,
  phase text not null,
  progress integer not null,
  completed integer not null,
  total integer not null,
  result_json text,
  error text,
  playlist_name text,
  original_total_items integer,
  created_at text not null,
  updated_at text not null,
  expires_at text not null
);

create index if not exists idx_jobs_session_updated_at on jobs (session_id, updated_at);
create index if not exists idx_jobs_expires_at on jobs (expires_at);
