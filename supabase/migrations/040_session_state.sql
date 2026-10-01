-- SPEC-028: Conversation State Tracking (Thema, Stimmung, Lösungsstand)
create table if not exists public.session_state (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  turn_index int not null default 0,
  topic text,
  sentiment text not null default 'neutral' check (sentiment in ('positiv', 'neutral', 'negativ')),
  resolution text not null default 'offen' check (resolution in ('offen', 'gelöst', 'eskaliert')),
  escalation_event_emitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_state enable row level security;

create policy "service_role_all" on public.session_state
  for all using (true) with check (true);

create index if not exists idx_session_state_session_id on public.session_state(session_id);
