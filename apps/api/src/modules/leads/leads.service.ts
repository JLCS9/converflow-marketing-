import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  createLeadSchema,
  importLeadsSchema,
  updateLeadSchema,
  type CreateLeadInput,
  type ImportLeadsInput,
  type UpdateLeadInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { CustomFieldsService } from '../custom-fields/custom-fields.service.js';

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
  ) {}

  list(tenantId: string, opts: ListOpts = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findMany({
        where: {
          status: (opts.status as never) || undefined,
          ownerId: opts.ownerId || undefined,
          OR: opts.search
            ? [
                { name: { contains: opts.search, mode: 'insensitive' } },
                { email: { contains: opts.search, mode: 'insensitive' } },
                { company: { contains: opts.search, mode: 'insensitive' } },
              ]
            : undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 100,
        skip: opts.offset ?? 0,
      }),
    );
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
              nif: lead.nif,
              address: lead.address,
              website: lead.website,
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
      nif?: string;
      address?: string;
      website?: string;
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
          nif: l.nif,
          address: l.address,
          website: l.website,
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
          nif: l.nif,
          address: l.address,
          website: l.website,
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
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) throw new Error(`"${def.label}": fecha no válida (${value})`);
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
