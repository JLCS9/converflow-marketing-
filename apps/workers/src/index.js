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
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
const logger = pino({ name: 'workers', level: process.env.LOG_LEVEL ?? 'info' });
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});
const queues = ['llm', 'embed', 'ocr', 'egress'];
const processors = {
    llm: async (job) => {
        logger.info({ jobId: job.id, name: job.name }, 'llm job received (stub)');
    },
    embed: async (job) => {
        logger.info({ jobId: job.id, name: job.name }, 'embed job received (stub)');
    },
    ocr: async (job) => {
        logger.info({ jobId: job.id, name: job.name }, 'ocr job received (stub)');
    },
    egress: async (job) => {
        logger.info({ jobId: job.id, name: job.name }, 'egress job received (stub)');
    },
};
const workers = queues.map((name) => new Worker(name, processors[name], {
    connection,
    concurrency: 4,
}));
// Expose helper queues for the API to enqueue work without depending on bullmq directly.
export const queueMap = Object.fromEntries(queues.map((name) => [name, new Queue(name, { connection })]));
async function shutdown(signal) {
    logger.info({ signal }, 'shutting down workers');
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
logger.info({ queues }, 'workers ready');
//# sourceMappingURL=index.js.map