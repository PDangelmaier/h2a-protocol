-- SPEC-008: Add 'summarization' purpose to model_purpose enum
-- Must be in its own transaction (PG cannot use new enum value in same TX)
ALTER TYPE model_purpose ADD VALUE IF NOT EXISTS 'summarization';
