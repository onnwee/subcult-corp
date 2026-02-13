-- pgvector extension + embedding column for semantic memory search
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE ops_agent_memory ADD COLUMN IF NOT EXISTS embedding vector(1024);

CREATE INDEX IF NOT EXISTS idx_memory_embedding
    ON ops_agent_memory USING hnsw (embedding vector_cosine_ops);
