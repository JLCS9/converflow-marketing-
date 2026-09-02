-- ============================================================================
-- DDL especial que Prisma no puede expresar (índices vectoriales, GIN, etc.).
-- Idempotente: se aplica con `pnpm apply:ddl` después de cada `db push`,
-- igual que rls-policies.sql. Patrón: todo CREATE lleva IF NOT EXISTS.
-- ============================================================================

-- --- Índice vectorial de rag_chunks -----------------------------------------
-- PENDIENTE DEL BENCHMARK DE F0: HNSW exige dimensión fija en la columna.
-- Cuando se cierre modelo/dimensión (p. ej. voyage-3.5-lite → 1024):
--
--   ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1024);
--   CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
--     ON rag_chunks USING hnsw (embedding vector_cosine_ops);
--
-- Hasta entonces la recuperación va por escaneo exacto: correcto (y hasta
-- preferible) con el volumen del piloto.

-- --- Búsqueda por metadatos de fragmentos -----------------------------------
CREATE INDEX IF NOT EXISTS rag_chunks_meta_gin ON rag_chunks USING gin (meta jsonb_path_ops);

-- --- Campos personalizados (F1 los explota; el índice ya no estorba) --------
CREATE INDEX IF NOT EXISTS profiles_custom_gin ON profiles USING gin (custom jsonb_path_ops);

-- --- Propiedades de eventos --------------------------------------------------
CREATE INDEX IF NOT EXISTS events_props_gin ON events USING gin (props jsonb_path_ops);
