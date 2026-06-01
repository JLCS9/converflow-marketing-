import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createLeadSchema,
  importLeadsSchema,
  parseFlexibleDate,
  updateLeadSchema,
  type CreateLeadInput,
  type ImportLeadsInput,
  type UpdateLeadInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { CustomFieldsService } from '../custom-fields/custom-fields.service.js';
import { PipelinesService } from '../pipelines/pipelines.service.js';

interface ScoreLeadOutput {
  score: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  recommendedActions: string[];
}

interface ListOpts {
  status?: string;
  ownerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly customFields: CustomFieldsService,
    private readonly pipelines: PipelinesService,
  ) {}

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findMany({
        where: this.buildWhere(opts),
        orderBy: { createdAt: 'desc' },
        take: Math.min(opts.limit ?? 100, 1000),
        skip: opts.offset ?? 0,
      }),
    );
  }

  /** Count of rows matching the current filters — used for pagination. */
  count(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const total = await tx.lead.count({ where: this.buildWhere(opts) });
      return { total };
    });
  }

  private buildWhere(opts: ListOpts) {
    return {
      status: (opts.status as never) || undefined,
      ownerId: opts.ownerId || undefined,
      OR: opts.search
        ? [
            { name: { contains: opts.search, mode: 'insensitive' as const } },
            { lastName: { contains: opts.search, mode: 'insensitive' as const } },
            { email: { contains: opts.search, mode: 'insensitive' as const } },
            { company: { contains: opts.search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        include: {
          client: true,
          opportunities: { orderBy: { createdAt: 'desc' } },
          tasks: { orderBy: { dueAt: 'asc' } },
          notes: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      return lead;
    });
  }

  async create(tenantId: string, input: CreateLeadInput) {
    const data = createLeadSchema.parse(input);
    const customFields = await this.customFields.validateValues(
      tenantId,
      'LEAD',
      data.customFields as Record<string, unknown> | undefined,
    );
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.create({
        data: {
          tenantId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          company: data.company,
          source: data.source ?? 'manual',
          status: data.status,
          ownerId: data.ownerId,
          customFields: (customFields as never) ?? undefined,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateLeadInput) {
    const data = updateLeadSchema.parse(input);
    const customFields = await this.customFields.validateValues(
      tenantId,
      'LEAD',
      data.customFields as Record<string, unknown> | undefined,
      { partial: true },
    );
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundError('Lead no encontrado');

      // Auto-stamp transitions
      const now = new Date();

      // When a lead is marked CLIENT it gets mirrored in the Client table for
      // legacy compatibility (the unified data model lives on Lead, but tasks
      // and opportunities still reference Client). We try to reuse a matching
      // client row by email before creating a new one.
      let clientId = lead.clientId ?? undefined;
      if (data.status === 'CLIENT' && !lead.clientId) {
        const existing = lead.email
          ? await tx.client.findFirst({ where: { email: lead.email } })
          : null;
        const client =
          existing ??
          (await tx.client.create({
            data: {
              tenantId,
              name: lead.company?.trim() || lead.name,
              email: lead.email,
              phone: lead.phone,
              source: lead.source,
              ownerId: lead.ownerId,
              status: 'ACTIVE',
            },
          }));
        clientId = client.id;
      }

      const dataWithStamps = {
        ...data,
        customFields: customFields !== undefined ? (customFields as never) : undefined,
        // Stamp once at the very first non-LEAD transition.
        contactedAt:
          !lead.contactedAt && data.status && data.status !== 'LEAD' ? now : undefined,
        qualifiedAt:
          !lead.qualifiedAt && data.status === 'CLIENT' ? now : undefined,
        clientId,
      };
      return tx.lead.update({ where: { id }, data: dataWithStamps });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      await tx.lead.delete({ where: { id } });
    });
  }

  async score(tenantId: string, id: string) {
    // 1. Fetch lead + notes (quick transaction).
    const lead = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findUnique({
        where: { id },
        include: { notes: { orderBy: { createdAt: 'desc' }, take: 20 } },
      }),
    );
    if (!lead) throw new NotFoundError('Lead no encontrado');

    const noteSummary = lead.notes.length
      ? lead.notes
          .map((n) => `- [${n.createdAt.toISOString().slice(0, 10)}] ${n.body.slice(0, 200)}`)
          .join('\n')
      : '(sin notas)';

    const customFields = lead.customFields
      ? JSON.stringify(lead.customFields, null, 2)
      : '(sin campos)';

    const userPrompt = [
      'Analiza este lead comercial y dale un score de 0 a 100 según su potencial de cierre.',
      '',
      `Nombre: ${lead.name}`,
      `Empresa: ${lead.company ?? '(no indicada)'}`,
      `Email: ${lead.email ?? '(no indicado)'}`,
      `Teléfono: ${lead.phone ?? '(no indicado)'}`,
      `Fuente: ${lead.source ?? '(no indicada)'}`,
      `Status actual: ${lead.status}`,
      `Score anterior: ${lead.score ?? '(nunca calculado)'}`,
      `Contactado el: ${lead.contactedAt?.toISOString() ?? '(no contactado)'}`,
      `Cualificado el: ${lead.qualifiedAt?.toISOString() ?? '(no cualificado)'}`,
      `Creado el: ${lead.createdAt.toISOString()}`,
      '',
      'Notas/interacciones recientes:',
      noteSummary,
      '',
      'Campos personalizados:',
      customFields,
      '',
      'Criterios para puntuar (España, B2B):',
      '- Empresa B2B con dominio corporativo → +20',
      '- Teléfono móvil completo → +10',
      '- Fuente "referido" o "ferias" → +15; "web" → +10; "scraping/lista" → +0',
      '- Notas que muestran intención de compra o presupuesto explícito → +25',
      '- Tono frío, ausencia de respuesta o petición de "info genérica" → -15',
      '- Antigüedad sin contactar > 14 días → -10',
      '',
      'Devuelve el resultado vía la herramienta `submit_lead_score`.',
    ].join('\n');

    // 2. Claude call OUTSIDE the transaction (can take 5-15s).
    const call = await this.ai.callWithTool<ScoreLeadOutput>({
      system:
        'Eres un analista comercial senior B2B en España. Devuelves resultados estructurados y concisos en castellano.',
      userPrompt,
      toolName: 'submit_lead_score',
      toolDescription:
        'Submit the lead score, priority bucket, reasoning and 1-3 recommended next actions.',
      toolInputSchema: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          reasoning: { type: 'string' },
          recommendedActions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
        required: ['score', 'priority', 'reasoning', 'recommendedActions'],
      },
      maxTokens: 800,
    });

    // 3. Persist the score in a fresh quick transaction.
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.update({
        where: { id },
        data: {
          score: call.result.score,
          aiScoreReasoning: call.result.reasoning,
          aiScoreActions: call.result.recommendedActions as never,
          aiScoredAt: new Date(),
        },
      }),
    );

    // Fire-and-forget usage log
    void this.ai.recordUsage({
      tenantId,
      feature: 'lead_scoring',
      callResult: call,
      resourceType: 'lead',
      resourceId: id,
    });

    return {
      lead: updated,
      ai: {
        score: call.result.score,
        priority: call.result.priority,
        reasoning: call.result.reasoning,
        recommendedActions: call.result.recommendedActions,
        model: call.model,
        durationMs: call.durationMs,
        costUsd: call.costUsd,
      },
    };
  }

  /**
   * Score-in-bulk endpoint. For each lead in `leadIds` (or every lead in the
   * tenant that matches the filter) runs Claude with the standard prompt plus
   * — if `agentId` is provided — the agent's systemPrompt as funnel rules.
   * Claude returns the regular score fields plus an optional statusDecision
   * and opportunityHint; when `updateStatus` / `createOpportunities` are on,
   * we apply them.
   *
   * Concurrency is capped to keep latency under common proxy timeouts; for
   * truly large batches the next iteration should move this to BullMQ.
   */
  async scoreBatch(
    tenantId: string,
    input: {
      leadIds?: string[];
      filter?: { status?: string; ownerId?: string; search?: string };
      agentId?: string | null;
      updateStatus?: boolean;
      createOpportunities?: boolean;
    },
  ): Promise<{
    scored: number;
    statusUpdated: number;
    opportunitiesCreated: number;
    errors: { leadId: string; reason: string }[];
  }> {
    const updateStatus = !!input.updateStatus;
    const createOpps = !!input.createOpportunities;
    const MAX = 250;
    const CONCURRENCY = 4;

    // Resolve target leads.
    const leads = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findMany({
        where: input.leadIds?.length
          ? { id: { in: input.leadIds } }
          : this.buildWhere(input.filter ?? {}),
        orderBy: { createdAt: 'desc' },
        take: MAX,
      }),
    );

    if (leads.length === 0) {
      return { scored: 0, statusUpdated: 0, opportunitiesCreated: 0, errors: [] };
    }

    // Optional funnel-rule injection from an agent. The user's agent definition
    // (systemPrompt + objective) is treated as plain text guidance.
    let funnelRules: string | null = null;
    if (input.agentId) {
      const agent = await this.prisma.withTenant(tenantId, (tx) =>
        tx.agent.findUnique({
          where: { id: input.agentId! },
          select: { systemPrompt: true, name: true, description: true },
        }),
      );
      if (agent) {
        funnelRules = [
          agent.name ? `Agente: ${agent.name}.` : null,
          agent.description ? `Descripción: ${agent.description}.` : null,
          agent.systemPrompt
            ? `Instrucciones / reglas del funnel:\n${agent.systemPrompt}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    // Resolve the default pipeline once if we'll be creating opps.
    const defaultPipeline = createOpps
      ? await this.pipelines.getDefault(tenantId).catch(() => null)
      : null;
    const defaultStage = defaultPipeline?.stages?.[0] ?? null;

    const results = {
      scored: 0,
      statusUpdated: 0,
      opportunitiesCreated: 0,
      errors: [] as { leadId: string; reason: string }[],
    };

    // Concurrency-limited fan-out.
    let cursor = 0;
    async function* take(this: LeadsService) {
      while (cursor < leads.length) {
        const idx = cursor++;
        yield leads[idx]!;
      }
    }
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      const iter = take.call(this);
      for await (const lead of iter) {
        try {
          await this.scoreOneInBatch(
            tenantId,
            lead,
            { funnelRules, updateStatus, createOpps, defaultPipeline, defaultStage },
            results,
          );
        } catch (e) {
          results.errors.push({
            leadId: lead.id,
            reason: e instanceof Error ? e.message : 'Error desconocido',
          });
        }
      }
    });
    await Promise.all(workers);

    return results;
  }

  private async scoreOneInBatch(
    tenantId: string,
    lead: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      source: string | null;
      status: string;
      score: number | null;
      createdAt: Date;
      customFields: unknown;
    },
    ctx: {
      funnelRules: string | null;
      updateStatus: boolean;
      createOpps: boolean;
      defaultPipeline: { id: string; stages: { id: string; key: string }[] } | null;
      defaultStage: { id: string; key: string } | null;
    },
    results: {
      scored: number;
      statusUpdated: number;
      opportunitiesCreated: number;
      errors: { leadId: string; reason: string }[];
    },
  ): Promise<void> {
    const customFields = lead.customFields
      ? JSON.stringify(lead.customFields, null, 2)
      : '(sin campos)';

    const userPrompt = [
      'Analiza este lead comercial y dale un score de 0 a 100 según su potencial de cierre.',
      '',
      `Nombre: ${lead.name}`,
      `Empresa: ${lead.company ?? '(no indicada)'}`,
      `Email: ${lead.email ?? '(no indicado)'}`,
      `Teléfono: ${lead.phone ?? '(no indicado)'}`,
      `Fuente: ${lead.source ?? '(no indicada)'}`,
      `Estado actual: ${lead.status}`,
      `Creado el: ${lead.createdAt.toISOString()}`,
      '',
      'Campos personalizados:',
      customFields,
      '',
      ctx.funnelRules
        ? `Reglas del funnel del tenant (aplícalas si encajan):\n${ctx.funnelRules}`
        : 'Sin reglas específicas del tenant. Usa criterios estándar B2B España.',
      '',
      'Devuelve el resultado vía la herramienta `submit_lead_score`.',
      ctx.updateStatus
        ? 'Si las reglas o los datos lo indican, decide el estado (LEAD, CLIENT o LOST) en `statusDecision`. Usa NO_CHANGE si no es claro.'
        : 'No decidas estado.',
      ctx.createOpps
        ? 'Si el lead tiene una oportunidad clara (interés en un producto/servicio), devuelve `opportunityHint` con nombre y estimación opcional de importe.'
        : 'No crees oportunidades.',
    ].join('\n');

    interface ScoreBatchOutput {
      score: number;
      priority: 'LOW' | 'MEDIUM' | 'HIGH';
      reasoning: string;
      recommendedActions: string[];
      statusDecision?: 'LEAD' | 'CLIENT' | 'LOST' | 'NO_CHANGE';
      opportunityHint?: {
        name: string;
        amount?: number;
        notes?: string;
      };
    }

    const call = await this.ai.callWithTool<ScoreBatchOutput>({
      system:
        'Eres un analista comercial senior B2B en España. Devuelves resultados estructurados y concisos en castellano.',
      userPrompt,
      toolName: 'submit_lead_score',
      toolDescription:
        'Submit the lead score, priority, reasoning, 1-3 recommended actions, and (optional) status decision and opportunity hint based on the funnel rules.',
      toolInputSchema: {
        type: 'object',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          reasoning: { type: 'string' },
          recommendedActions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
          statusDecision: {
            type: 'string',
            enum: ['LEAD', 'CLIENT', 'LOST', 'NO_CHANGE'],
            description:
              'Only set when funnel rules clearly indicate the lead has progressed. Use NO_CHANGE otherwise.',
          },
          opportunityHint: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['name'],
            description:
              'Only set when the lead shows clear interest in a specific product/service worth tracking.',
          },
        },
        required: ['score', 'priority', 'reasoning', 'recommendedActions'],
      },
      maxTokens: 800,
    });

    await this.prisma.withTenant(tenantId, async (tx) => {
      // Decide status update.
      let newStatus: 'LEAD' | 'CLIENT' | 'LOST' | null = null;
      if (ctx.updateStatus && call.result.statusDecision && call.result.statusDecision !== 'NO_CHANGE') {
        if (call.result.statusDecision !== lead.status) {
          newStatus = call.result.statusDecision;
        }
      }

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          score: call.result.score,
          aiScoreReasoning: call.result.reasoning,
          aiScoreActions: call.result.recommendedActions as never,
          aiScoredAt: new Date(),
          ...(newStatus ? { status: newStatus } : {}),
        },
      });
      results.scored += 1;
      if (newStatus) results.statusUpdated += 1;

      // Mirror a Client when AI promotes to CLIENT (same behaviour as manual update).
      if (newStatus === 'CLIENT') {
        const existing = lead.email
          ? await tx.client.findFirst({ where: { email: lead.email } })
          : null;
        if (!existing) {
          await tx.client.create({
            data: {
              tenantId,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              source: lead.source,
              status: 'ACTIVE',
            },
          });
        }
      }

      // Create opportunity if requested and AI hinted one.
      if (ctx.createOpps && ctx.defaultPipeline && ctx.defaultStage && call.result.opportunityHint?.name) {
        await tx.opportunity.create({
          data: {
            tenantId,
            leadId: lead.id,
            name: call.result.opportunityHint.name.slice(0, 150),
            amount: call.result.opportunityHint.amount ?? null,
            currency: 'EUR',
            status: 'OPEN',
            probability: Math.min(100, Math.max(0, call.result.score)),
            pipelineId: ctx.defaultPipeline.id,
            stageId: ctx.defaultStage.id,
          },
        });
        results.opportunitiesCreated += 1;
      }
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'lead_scoring_batch',
      callResult: call,
      resourceType: 'lead',
      resourceId: lead.id,
    });
  }

  async bulkImport(tenantId: string, input: ImportLeadsInput) {
    // Validate the OUTER shape only — each row is validated below so one bad
    // cell doesn't take down the entire batch.
    const data = importLeadsSchema.parse(input);
    // Load custom field definitions once and validate each row in memory so a
    // 1k-row import doesn't hammer the DB.
    const definitions = await this.prisma.withTenant(tenantId, (tx) =>
      tx.customFieldDefinition.findMany({
        where: { entityType: 'LEAD', archivedAt: null },
        select: {
          id: true,
          key: true,
          label: true,
          type: true,
          required: true,
          options: true,
        },
      }),
    );

    const errors: { row: number; reason: string }[] = [];
    const valid: Array<{
      name: string;
      lastName?: string;
      email?: string;
      phone?: string;
      company?: string;
      source: string;
      status: 'LEAD' | 'CLIENT' | 'LOST';
      ownerId?: string;
      customFields?: Record<string, unknown>;
    }> = [];

    for (let i = 0; i < data.leads.length; i += 1) {
      const raw = data.leads[i]!;
      const rowLabel = i + 2; // +1 header, +1 1-indexed
      try {
        const parsed = createLeadSchema.safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const field = issue?.path?.join('.') ?? 'campo';
          throw new Error(`${field}: ${issue?.message ?? 'inválido'}`);
        }
        const l = parsed.data;
        const customFields = validateCustomFieldsInMemory(definitions, l.customFields);
        valid.push({
          name: l.name,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          company: l.company,
          source: l.source ?? 'import',
          status: l.status ?? 'LEAD',
          ownerId: l.ownerId,
          customFields,
        });
      } catch (e) {
        errors.push({
          row: rowLabel,
          reason: e instanceof Error ? e.message : 'Error desconocido',
        });
      }
    }

    if (valid.length === 0) {
      return { imported: 0, skipped: errors.length, errors };
    }

    const created = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.createMany({
        data: valid.map((l) => ({
          tenantId,
          name: l.name,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          company: l.company,
          source: l.source,
          status: l.status,
          ownerId: l.ownerId,
          customFields: (l.customFields as never) ?? undefined,
        })),
        skipDuplicates: true,
      }),
    );

    return {
      imported: created.count,
      skipped: errors.length + (valid.length - created.count),
      errors,
    };
  }
}

interface DefLike {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
}

/** Mirrors CustomFieldsService.validateValues but works on a pre-loaded set. */
function validateCustomFieldsInMemory(
  defs: DefLike[],
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw || Object.keys(raw).length === 0) {
    // Still enforce required fields when they're not provided
    const missing = defs.filter((d) => d.required);
    if (missing.length > 0) {
      throw new Error(`Faltan campos obligatorios: ${missing.map((d) => d.label).join(', ')}`);
    }
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const value = raw[def.key];
    const hasValue = value !== undefined && value !== null && value !== '';
    if (!hasValue) {
      if (def.required) throw new Error(`Falta "${def.label}"`);
      continue;
    }
    out[def.key] = coerceForImport(def, value);
  }
  return out;
}

function coerceForImport(def: DefLike, value: unknown): unknown {
  switch (def.type) {
    case 'TEXT':
    case 'LONGTEXT':
    case 'PHONE':
    case 'URL':
    case 'EMAIL': {
      const s = String(value).trim();
      if (def.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new Error(`"${def.label}": email no válido (${s})`);
      }
      if (def.type === 'URL') {
        try {
          new URL(s);
        } catch {
          throw new Error(`"${def.label}": URL no válida (${s})`);
        }
      }
      return s;
    }
    case 'NUMBER': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      if (!Number.isFinite(n)) throw new Error(`"${def.label}": no es numérico (${value})`);
      return n;
    }
    case 'DATE': {
      const d = parseFlexibleDate(value);
      if (!d) {
        throw new Error(
          `"${def.label}": fecha no válida (${value}). Usa DD/MM/AAAA o AAAA-MM-DD.`,
        );
      }
      return d.toISOString();
    }
    case 'BOOLEAN': {
      if (typeof value === 'boolean') return value;
      const s = String(value).toLowerCase().trim();
      if (['true', '1', 'yes', 'si', 'sí', 'x'].includes(s)) return true;
      if (['false', '0', 'no', ''].includes(s)) return false;
      throw new Error(`"${def.label}": sí/no esperado (${value})`);
    }
    case 'SELECT': {
      const options = Array.isArray(def.options) ? (def.options as Array<{ value: string; label: string }>) : [];
      const s = String(value).trim();
      const match = options.find((o) => o.value === s || o.label === s);
      if (!match) throw new Error(`"${def.label}": valor "${s}" no está entre las opciones`);
      return match.value;
    }
    case 'MULTISELECT': {
      const options = Array.isArray(def.options) ? (def.options as Array<{ value: string; label: string }>) : [];
      const arr = Array.isArray(value)
        ? value
        : String(value)
            .split(/[|;,]/)
            .map((s) => s.trim())
            .filter(Boolean);
      const out: string[] = [];
      for (const v of arr) {
        const s = String(v);
        const match = options.find((o) => o.value === s || o.label === s);
        if (!match) throw new Error(`"${def.label}": valor "${s}" no está entre las opciones`);
        if (!out.includes(match.value)) out.push(match.value);
      }
      return out;
    }
    case 'DOCUMENT':
      throw new Error(`"${def.label}": tipo Documento no se puede importar por CSV`);
    default:
      return value;
  }
}
