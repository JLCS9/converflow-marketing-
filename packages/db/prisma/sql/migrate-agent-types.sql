-- =====================================================================
-- Migration: collapse 12-value AgentType into 3 engines.
--
-- Why a separate SQL file: Postgres won't let us ALTER TYPE … DROP VALUE
-- while rows still reference those values, AND prisma db push refuses to
-- shrink an enum that has dependent data. So we do it in three steps and
-- guarantee idempotence so it's safe to re-run:
--
--   1) ADD the three new values (CONVERSATIONAL exists already, so the
--      net new ones are OPPORTUNITIES + UTILITY).
--   2) UPDATE every row that uses a legacy value to point at the right
--      engine, also setting Agent.template for analytics + UI prefill.
--   3) DROP the legacy values from the enum.
--
-- The new Agent.template column is created idempotently up front in case
-- this script runs before `prisma db push`.
-- =====================================================================

BEGIN;

-- Defensive: make sure the column exists before we write to it.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS template VARCHAR(40);

-- 1) Add new enum values. Postgres requires IF NOT EXISTS for each one.
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'OPPORTUNITIES';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'UTILITY';

-- The ALTER TYPE … ADD VALUE statements must be committed before the
-- values are usable in the same transaction. Close it and reopen.
COMMIT;
BEGIN;

-- 2) Migrate existing rows to the new shape. Templates are derived from
-- the legacy purpose so the UI can pre-select the right wizard tile.
UPDATE agents SET type = 'CONVERSATIONAL', template = COALESCE(template, 'agenda')
  WHERE type = 'AGENDA_PROPOSAL';

UPDATE agents SET type = 'OPPORTUNITIES', template = COALESCE(template, 'oportunidades')
  WHERE type = 'SCORING';

-- Any "soon" agent that somehow got persisted (unlikely — they were UI
-- placeholders) gets folded into Conversational so we don't lose data.
UPDATE agents SET type = 'CONVERSATIONAL', template = COALESCE(template,
  CASE type
    WHEN 'TRIAGE'        THEN 'triage'
    WHEN 'ENRICHMENT'    THEN 'enriquecimiento'
    WHEN 'FOLLOW_UP'     THEN 'seguimiento'
    WHEN 'ONBOARDING'    THEN 'onboarding'
    WHEN 'SUPPORT'       THEN 'soporte'
    WHEN 'REACTIVATION'  THEN 'reactivacion'
    WHEN 'DATA_CLEANUP'  THEN 'limpieza'
    WHEN 'REPORTS'       THEN 'informes'
    WHEN 'SUMMARIES'     THEN 'resumenes'
    ELSE NULL
  END)
  WHERE type IN (
    'TRIAGE','ENRICHMENT','FOLLOW_UP','ONBOARDING','SUPPORT','REACTIVATION',
    'DATA_CLEANUP','REPORTS','SUMMARIES'
  );

-- Map utility-flavoured templates to the UTILITY engine.
UPDATE agents SET type = 'UTILITY'
  WHERE template IN ('limpieza','informes','resumenes','enriquecimiento');

COMMIT;

-- 3) Drop the legacy values. Postgres 12+ supports DROP VALUE, but only
-- when no row uses them. The UPDATEs above guarantee that.
BEGIN;

-- Postgres still doesn't have a portable DROP VALUE so we recreate the
-- enum side-by-side, swap columns, and drop the old type.
ALTER TYPE "AgentType" RENAME TO "AgentType_old";

CREATE TYPE "AgentType" AS ENUM ('CONVERSATIONAL', 'OPPORTUNITIES', 'UTILITY');

ALTER TABLE agents
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN type TYPE "AgentType" USING type::text::"AgentType",
  ALTER COLUMN type SET DEFAULT 'CONVERSATIONAL';

DROP TYPE "AgentType_old";

COMMIT;
