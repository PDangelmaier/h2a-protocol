-- SPEC-021: A/B Tests für Prompt-Versionen
create table if not exists public.ab_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  personality_id text not null,
  is_active boolean not null default false,
  variants jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  started_by text,
  ended_by text,
  created_at timestamptz not null default now()
);

comment on column public.ab_experiments.variants is
  'Array of {prompt_version_id: uuid, weight: number (0-1)} — weights must sum to 1.0';

alter table public.ab_experiments enable row level security;

create policy "service_role_all" on public.ab_experiments
  for all using (true) with check (true);

-- Add experiment tracking columns to conversation_turns
alter table public.conversation_turns
  add column if not exists experiment_id uuid,
  add column if not exists experiment_variant int;
