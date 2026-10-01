-- SPEC-027: Add 'fast' purpose to model_purpose enum
-- Must be separate migration: new enum values require commit before use

ALTER TYPE model_purpose ADD VALUE IF NOT EXISTS 'fast';
