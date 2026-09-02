-- E1 · Convergencia del pipeline de IA — backfill ONE-OFF (ejecutar UNA vez
-- tras el db push de E1; no forma parte del deploy.sh porque no es
-- idempotente frente a decisiones posteriores del tenant).
--
--   docker compose -f infra/docker/docker-compose.prod.yml \
--     --env-file infra/docker/.env.prod exec -T api sh -c \
--     "cd /repo/packages/db && npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/backfill-e1.sql"

-- 1) Los webchat hoy SIEMPRE entregan: sin esto, el gate nuevo los degradaría
--    a SUGGEST y dejarían de responder solos.
UPDATE bots SET "replyMode" = 'AUTO'
WHERE channel = 'WEBCHAT' AND "replyMode" = 'SUGGEST';

-- 2) Preservar el comportamiento actual: los webchat de tenants con memoria
--    ya eran atendidos por el motor (gate hasMemory) → quedan en ENGINE.
UPDATE bots b SET "aiEngine" = 'ENGINE'
WHERE b.channel = 'WEBCHAT'
  AND EXISTS (
    SELECT 1 FROM tenant_instructions ti
    WHERE ti."tenantId" = b."tenantId" AND ti.active
    UNION
    SELECT 1 FROM rag_chunks rc WHERE rc."tenantId" = b."tenantId"
  );

-- 3) Las reglas de funnel del scoring por lote dejan de vivir en systemPrompt.
UPDATE agents SET "funnelRules" = "systemPrompt"
WHERE type = 'OPPORTUNITIES' AND "funnelRules" IS NULL AND length("systemPrompt") > 0;
