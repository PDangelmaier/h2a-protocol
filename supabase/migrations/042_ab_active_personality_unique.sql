-- SPEC-021: Enforce at most one active experiment per personality
create unique index if not exists idx_ab_experiments_active_personality
  on public.ab_experiments (personality_id)
  where is_active = true;
