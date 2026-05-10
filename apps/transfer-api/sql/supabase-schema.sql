create table if not exists public.transfers (
  id text primary key,
  session_id text not null,
  status text not null,
  input text not null,
  analysis_limit integer not null,
  analysis_json jsonb not null,
  created_apple_playlist_id text,
  created_from_confidence_threshold double precision,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_transfers_updated_at
  on public.transfers (updated_at);

create index if not exists idx_transfers_session_updated_at
  on public.transfers (session_id, updated_at);

alter table public.transfers enable row level security;

comment on table public.transfers is
  'PlaylistTransfer anonymous transfer reports. Access from the API server should use the Supabase service role key only.';
