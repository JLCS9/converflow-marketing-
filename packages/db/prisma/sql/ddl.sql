-- ============================================================================
-- DDL especial que Prisma no puede expresar (índices vectoriales, GIN, etc.).
-- Idempotente: se aplica con `pnpm apply:ddl` después de cada `db push`,
-- igual que rls-policies.sql. Patrón: todo CREATE lleva IF NOT EXISTS.
-- ============================================================================

-- --- Índice vectorial de rag_chunks -----------------------------------------
-- DECISIÓN F0 (benchmark 2026-09-02, recall@1 sobre los dos verticales):
-- voyage-3.5-lite · dim 1024 — iguala o supera a voyage-3.5 costando ~6x
-- menos. Cambiar de modelo = nueva colección re-vectorizada; si cambia la
-- dimensión, este ALTER es el único sitio que tocar (con la tabla vacía o
-- re-vectorizando antes).
DO $$
BEGIN
  -- Tipa la columna solo si aún no tiene dimensión (idempotente).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_chunks' AND column_name = 'embedding'
      AND (SELECT atttypmod FROM pg_attribute
           WHERE attrelid = 'rag_chunks'::regclass AND attname = 'embedding') = -1
  ) THEN
    ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1024);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);

-- --- Búsqueda por metadatos de fragmentos -----------------------------------
CREATE INDEX IF NOT EXISTS rag_chunks_meta_gin ON rag_chunks USING gin (meta jsonb_path_ops);

-- --- Campos personalizados (F1 los explota; el índice ya no estorba) --------
CREATE INDEX IF NOT EXISTS profiles_custom_gin ON profiles USING gin (custom jsonb_path_ops);

-- --- Propiedades de eventos --------------------------------------------------
CREATE INDEX IF NOT EXISTS events_props_gin ON events USING gin (props jsonb_path_ops);

-- --- knowledge_gaps: misma dimensión que la memoria (agrupación por similitud)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_gaps' AND column_name = 'embedding'
      AND (SELECT atttypmod FROM pg_attribute
           WHERE attrelid = 'knowledge_gaps'::regclass AND attname = 'embedding') = -1
  ) THEN
    ALTER TABLE knowledge_gaps ALTER COLUMN embedding TYPE vector(1024);
  END IF;
END $$;
