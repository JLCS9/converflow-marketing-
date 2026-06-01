import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConflictError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { LeadScoringQueue, type LeadScoringJob } from './lead-scoring.queue.js';
import { ScoringRunner } from '../agents/agent-runners/scoring.js';

interface StartBatchInput {
  leadIds?: string[];
  filter?: { status?: string; ownerId?: string; search?: string };
  agentId?: string | null;
  updateStatus?: boolean;
  createOpportunities?: boolean;
}

interface BatchStatus {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'FAILED';
  total: number;
  completed: number;
  failed: number;
  statusUpdated: number;
  oppsCreated: number;
  startedAt: string | null;
  finishedAt: string | null;
  etaSeconds: number | null;
  errors: { leadId: string; reason: string }[];
}

@Injectable()
export class LeadScoringService implements OnModuleInit {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: LeadScoringQueue,
    private readonly runner: ScoringRunner,
  ) {}

  onModuleInit() {
    // The worker runs in this same process — wires once.
    this.queue.registerProcessor(async (job) => {
      await this.processOne(job.data);
    }, 4);
  }

  async start(tenantId: string, input: StartBatchInput): Promise<{ batchId: string; total: number }> {
    const updateStatus = !!input.updateStatus;
    const createOpps = !!input.createOpportunities;

    // Resolve target leads.
    const leads = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findMany({
        where: input.leadIds?.length
          ? { id: { in: input.leadIds } }
          : {
              status: (input.filter?.status as never) || undefined,
              ownerId: input.filter?.ownerId || undefined,
              OR: input.filter?.search
                ? [
                    { name: { contains: input.filter.search, mode: 'insensitive' as const } },
                    { lastName: { contains: input.filter.search, mode: 'insensitive' as const } },
                    { email: { contains: input.filter.search, mode: 'insensitive' as const } },
                  ]
                : undefined,
            },
        select: { id: true },
        take: 5000,
        orderBy: { createdAt: 'desc' },
      }),
    );

    if (leads.length === 0) {
      throw new NotFoundError('No hay leads que procesar');
    }

    // Don't allow two running batches per tenant — keeps the cost predictable
    // and the UI simple. The user can cancel an existing batch to start a new one.
    const running = await this.prisma.withTenant(tenantId, (tx) =>
      tx.leadScoreBatch.findFirst({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
      }),
    );
    if (running) {
      throw new ConflictError('Ya hay un score en marcha. Cancélalo o espera a que termine.');
    }

    const batch = await this.prisma.withTenant(tenantId, (tx) =>
      tx.leadScoreBatch.create({
        data: {
          tenantId,
          agentId: input.agentId ?? null,
          total: leads.length,
          status: 'QUEUED',
          options: { updateStatus, createOpportunities: createOpps } as never,
        },
      }),
    );

    const jobs: LeadScoringJob[] = leads.map((l) => ({
      batchId: batch.id,
      tenantId,
      leadId: l.id,
    }));
    await this.queue.enqueueMany(jobs);

    this.logger.log(`Enqueued batch ${batch.id} with ${jobs.length} jobs`);
    return { batchId: batch.id, total: leads.length };
  }

  async status(tenantId: string, batchId: string): Promise<BatchStatus> {
    const batch = await this.prisma.withTenant(tenantId, (tx) =>
      tx.leadScoreBatch.findUnique({ where: { id: batchId } }),
    );
    if (!batch) throw new NotFoundException();

    const done = batch.completed + batch.failed;
    let eta: number | null = null;
    if (batch.status === 'RUNNING' && batch.startedAt && done > 0) {
      const elapsed = (Date.now() - batch.startedAt.getTime()) / 1000;
      const perLead = elapsed / done;
      eta = Math.round(perLead * (batch.total - done));
    }

    return {
      id: batch.id,
      status: batch.status as BatchStatus['status'],
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      statusUpdated: batch.statusUpdated,
      oppsCreated: batch.oppsCreated,
      startedAt: batch.startedAt?.toISOString() ?? null,
      finishedAt: batch.finishedAt?.toISOString() ?? null,
      etaSeconds: eta,
      errors: (batch.errors as Array<{ leadId: string; reason: string }>).slice(-50),
    };
  }

  async cancel(tenantId: string, batchId: string): Promise<void> {
    const batch = await this.prisma.withTenant(tenantId, (tx) =>
      tx.leadScoreBatch.findUnique({ where: { id: batchId } }),
    );
    if (!batch) throw new NotFoundException();
    if (batch.status === 'DONE' || batch.status === 'CANCELLED') return;

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.leadScoreBatch.update({
        where: { id: batchId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), finishedAt: new Date() },
      }),
    );
    await this.queue.removeWaitingForBatch(batchId);
  }

  /** Last 5 batches of a tenant — used by the global "running" indicator. */
  recent(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.leadScoreBatch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          total: true,
          completed: true,
          failed: true,
          createdAt: true,
          finishedAt: true,
        },
      }),
    );
  }

  /** Worker entry — runs OUTSIDE any tenant tx; we bypass + use withTenant inside. */
  private async processOne(job: LeadScoringJob): Promise<void> {
    // Fast path: if the batch has been cancelled, skip the AI call.
    const batch = await this.prisma.bypass((tx) =>
      tx.leadScoreBatch.findUnique({ where: { id: job.batchId } }),
    );
    if (!batch || batch.status === 'CANCELLED') return;

    // First processed job of a batch flips QUEUED → RUNNING + startedAt.
    if (batch.status === 'QUEUED') {
      await this.prisma.bypass((tx) =>
        tx.leadScoreBatch.update({
          where: { id: job.batchId },
          data: { status: 'RUNNING', startedAt: new Date() },
        }),
      );
    }

    try {
      const result = await this.runner.scoreOne(job.tenantId, job.leadId, {
        agentId: batch.agentId,
        updateStatus: (batch.options as { updateStatus?: boolean }).updateStatus ?? false,
        createOpportunities:
          (batch.options as { createOpportunities?: boolean }).createOpportunities ?? false,
      });
      await this.prisma.bypass((tx) =>
        tx.leadScoreBatch.update({
          where: { id: job.batchId },
          data: {
            completed: { increment: 1 },
            statusUpdated: { increment: result.statusUpdated ? 1 : 0 },
            oppsCreated: { increment: result.oppCreated ? 1 : 0 },
          },
        }),
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Error desconocido';
      this.logger.warn(`Lead ${job.leadId} failed: ${reason}`);
      // Append error to the json array.
      const current = await this.prisma.bypass((tx) =>
        tx.leadScoreBatch.findUnique({
          where: { id: job.batchId },
          select: { errors: true },
        }),
      );
      const errs = (current?.errors as Array<{ leadId: string; reason: string }> | undefined) ?? [];
      errs.push({ leadId: job.leadId, reason });
      await this.prisma.bypass((tx) =>
        tx.leadScoreBatch.update({
          where: { id: job.batchId },
          data: {
            failed: { increment: 1 },
            errors: errs.slice(-200) as never,
          },
        }),
      );
    }

    // If this was the last job, flip to DONE.
    const fresh = await this.prisma.bypass((tx) =>
      tx.leadScoreBatch.findUnique({ where: { id: job.batchId } }),
    );
    if (fresh && fresh.completed + fresh.failed >= fresh.total && fresh.status === 'RUNNING') {
      await this.prisma.bypass((tx) =>
        tx.leadScoreBatch.update({
          where: { id: job.batchId },
          data: { status: 'DONE', finishedAt: new Date() },
        }),
      );
    }
  }
}
