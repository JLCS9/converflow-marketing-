/**
 * Workers entry point. Spins up BullMQ workers for:
 *   - llm:   call Claude with prompt caching, persist responses.
 *   - embed: compute embeddings, store in pgvector.
 *   - ocr:   extract text from documents.
 *   - egress: send outbound messages via channel adapters.
 *
 * Concrete worker bodies arrive in Fase 2-3; this scaffold establishes
 * shutdown handling, Redis connection, and logging.
 */
import { Queue } from 'bullmq';
declare const queues: readonly ["llm", "embed", "ocr", "egress"];
type QueueName = (typeof queues)[number];
export declare const queueMap: Record<QueueName, Queue>;
export {};
//# sourceMappingURL=index.d.ts.map