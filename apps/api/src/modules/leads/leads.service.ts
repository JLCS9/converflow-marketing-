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
import { ScoringRunner } from '../agents/agent-runners/scoring.js';
import { buildLeadTimeline } from './lead-timeline.js';
import { AiService } from '../../common/ai/ai.service.js';
import { CustomFieldsService } from '../custom-fields/custom-fields.service.js';

interface ListOpts {
  status?: string;
  ownerId?: string;
  search?: string;
  /** Filtro por canal de origen (igualdad exacta, case-insensitive). */
  source?: string;
  /** Rango de creación, ISO yyyy-mm-dd (el hasta es inclusivo: fin de día). */
  createdFrom?: string;
  createdTo?: string;
  /** Puntuación IA mínima. */
  scoreMin?: number;
  limit?: number;
  offset?: number;
}

/** yyyy-mm-dd → Date, o undefined si no parsea. Nunca lanza por una URL rota. */
function parseDay(s: string | undefined, endOfDay = false): Date | undefined {
  if (!s) return undefined;
  const d = new Date(endOfDay ? `${s}T23:59:59.999` : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly customFields: CustomFieldsService,
    private readonly scoringRunner: ScoringRunner,
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
    const from = parseDay(opts.createdFrom);
    const to = parseDay(opts.createdTo, true);
    return {
      status: (opts.status as never) || undefined,
      ownerId: opts.ownerId || undefined,
      source: opts.source ? { equals: opts.source, mode: 'insensitive' as const } : undefined,
      createdAt: from || to ? { gte: from, lte: to } : undefined,
      score: opts.scoreMin != null && !Number.isNaN(opts.scoreMin) ? { gte: opts.scoreMin } : undefined,
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

      // Note.authorId is a plain string (no FK relation), so resolve author
      // names by hand for the comments UI. One query for the whole page.
      const authorIds = [...new Set(lead.notes.map((n) => n.authorId).filter(Boolean))];
      const users = authorIds.length
        ? await tx.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(users.map((u) => [u.id, u.name]));
      return {
        ...lead,
        notes: lead.notes.map((n) => ({ ...n, authorName: nameById.get(n.authorId) ?? null })),
      };
    });
  }

  /**
   * Derived activity timeline for the canonical lead card (Bloque 3).
   * No table behind it: see lead-timeline.ts.
   */
  async timeline(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        select: {
          source: true,
          createdAt: true,
          contactedAt: true,
          qualifiedAt: true,
          convertedAt: true,
          opportunities: {
            select: {
              id: true,
              name: true,
              status: true,
              amount: true,
              currency: true,
              createdAt: true,
              closedAt: true,
            },
          },
          conversations: { select: { id: true, channel: true, createdAt: true } },
        },
      });
      if (!lead) throw new NotFoundError('Lead no encontrado');
      return buildLeadTimeline({
        lead,
        opportunities: lead.opportunities,
        conversations: lead.conversations,
      });
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
        convertedAt:
          !lead.convertedAt && data.status === 'CLIENT' ? now : undefined,
        clientId,
      };
      return tx.lead.update({ where: { id }, data: dataWithStamps });
    });
  }

  /**
   * Borrado RGPD (art. 17). Elimina TODO lo que la UI promete: el lead, sus
   * conversaciones con mensajes (colgaban con SetNull y sobrevivían — deuda
   * corregida en F1), y su perfil del plano de datos (cascade: identidades,
   * eventos, estados y consentimientos). Deja una entrada técnica en el
   * registro de auditoría SIN datos personales.
   */
  async remove(tenantId: string, id: string, actorEmail?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        select: { id: true, profileId: true },
      });
      if (!lead) throw new NotFoundError('Lead no encontrado');

      // Conversaciones del lead (los mensajes caen por FK cascade).
      const convs = await tx.conversation.deleteMany({ where: { leadId: id } });

      // Perfil del plano de datos, si existe (cascade sobre identidades,
      // eventos, lifecycle_states y consents).
      if (lead.profileId) {
        await tx.profile.delete({ where: { id: lead.profileId } }).catch(() => undefined);
      }

      await tx.lead.delete({ where: { id } });

      // Auditoría técnica sin PII (lo que promete el diálogo de la UI).
      await tx.accessLog.create({
        data: {
          tenantId,
          email: actorEmail ?? 'system',
          action: 'gdpr.lead_delete',
          resource: `lead:${id}`,
          success: true,
          metadata: { conversationsDeleted: convs.count, profileDeleted: Boolean(lead.profileId) },
        },
      });
    });
  }

  /**
   * F3.5 · El scoring individual DELEGA en el runner unificado (el antiguo
   * prompt duplicado murió aquí): mismas notas, mismos campos vía
   * definiciones, sin decisión de estado ni oportunidades.
   */
  async score(tenantId: string, id: string) {
    const res = await this.scoringRunner.scoreOne(tenantId, id, {
      agentId: null,
      updateStatus: false,
      createOpportunities: false,
      feature: 'lead_scoring',
    });
    const lead = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findUnique({ where: { id } }),
    );
    return { lead, ai: res.ai };
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
