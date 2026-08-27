-- ¿Quién depende todavía del sistema de correo antiguo?
-- Ejecutar en producción ANTES de borrar nada.

\echo '--- 1. Buzones del sistema VIEJO (EmailConnection, por bot) ---'
SELECT t.name AS tenant, ec.email, ec.status, ec."lastSeenUid",
       ec."updatedAt"::date AS ultimo_cambio
FROM email_connections ec JOIN tenants t ON t.id = ec."tenantId"
ORDER BY ec."updatedAt" DESC;

\echo '--- 2. Buzones del sistema NUEVO (MailConnection) ---'
SELECT t.name AS tenant, mc."fromAddress", mc.status, mc.visibility,
       mc."lastSyncedAt"::date AS ultimo_sync
FROM mail_connections mc JOIN tenants t ON t.id = mc."tenantId"
ORDER BY mc."updatedAt" DESC;

\echo '--- 3. PELIGRO: mismo buzón conectado por AMBOS caminos (doble ingesta) ---'
SELECT t.name AS tenant, ec.email
FROM email_connections ec
JOIN mail_connections mc
  ON mc."tenantId" = ec."tenantId" AND lower(mc."fromAddress") = lower(ec.email)
JOIN tenants t ON t.id = ec."tenantId";

\echo '--- 4. Tenants que SOLO tienen el viejo (perderían el correo al borrarlo) ---'
SELECT t.name AS tenant, ec.email
FROM email_connections ec JOIN tenants t ON t.id = ec."tenantId"
WHERE NOT EXISTS (SELECT 1 FROM mail_connections mc WHERE mc."tenantId" = ec."tenantId");

\echo '--- 5. Volumen de correo en el modelo viejo (Conversation canal EMAIL) ---'
SELECT count(DISTINCT c.id) AS conversaciones, count(m.id) AS mensajes,
       max(m."createdAt")::date AS ultimo
FROM conversations c LEFT JOIN messages m ON m."conversationId" = c.id
WHERE c.channel = 'EMAIL';

\echo '--- 6. Supresiones (bajas RGPD) — NO se tocan, las campañas siguen vivas ---'
SELECT channel, count(*) FROM suppressions GROUP BY channel;
