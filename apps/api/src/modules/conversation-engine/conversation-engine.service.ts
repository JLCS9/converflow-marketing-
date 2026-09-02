import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ConsentsService } from '../consents/consents.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { CustomFieldsService } from '../custom-fields/custom-fields.service.js';
import {
  buildExtractionSchema,
  sanitizeExtraction,
  type ExtractableFieldDef,
} from '../knowledge/extraction.js';
import { buildEngineSystem } from './context.js';

interface EngineToolOutput {
  reply: string;
  can_answer: boolean;
  wants_contact?: { accepted?: boolean; channel?: 'email' | 'phone'; value?: string };
  extracted?: Record<string, unknown>;
}

export interface EngineResult {
  reply: string;
  canAnswer: boolean;
  gapId?: string;
  extractedKeys: string[];
  consentGranted: boolean;
}

/** ¿Tiene el tenant memoria configurada? (caché corta, por proceso). */
const MEMORY_TTL_MS = 60_000;

/**
 * Motor conversacional (F2): ensambla contexto (instrucciones + FUENTES con
 * prioridad de verificadas + perfil + reglas de canal), genera en UNA llamada
 * (respuesta + extracción + detección de laguna) y cierra el bucle:
 *  - extracción → campos del perfil (validados contra las definiciones)
 *  - no sabe → laguna registrada (prioritaria si hay lead esperando) y
 *    ofrecimiento de contacto
 *  - aceptación de contacto → consentimiento con evidencia literal
 */
@Injectable()
export class ConversationEngineService {
  private readonly logger = new Logger(ConversationEngineService.name);
  private readonly memoryCache = new Map<string, { has: boolean; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly knowledge: KnowledgeService,
    private readonly consents: ConsentsService,
    private readonly profiles: ProfilesService,
    private readonly customFields: CustomFieldsService,
  ) {}

  /** El motor se activa solo cuando el tenant tiene memoria: instrucciones o
   *  conocimiento vectorizado. Los tenants sin memoria siguen con el flujo
   *  anterior (agente clásico / clasificación) sin cambio alguno. */
  async hasMemory(tenantId: string): Promise<boolean> {
    const hit = this.memoryCache.get(tenantId);
    if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.has;
    const [instructions, chunks] = await this.prisma.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.tenantInstruction.count({ where: { active: true } }),
        tx.ragChunk.count(),
      ]),
    );
    const has = instructions > 0 || chunks > 0;
    this.memoryCache.set(tenantId, { has, at: Date.now() });
    return has;
  }

  async respond(
    tenantId: string,
    opts: {
      channel: string;
      text: string;
      history: { direction: 'IN' | 'OUT'; body: string }[];
      profileId?: string | null;
      leadWaiting?: boolean;
    },
  ): Promise<EngineResult> {
    // 1. Piezas del contexto (lecturas cortas, cada una en su transacción).
    const [tenant, instructions, blocks, extractableDefs, profile] = await Promise.all([
      this.prisma.bypass((tx) =>
        tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ),
      this.knowledge.listInstructions(tenantId),
      this.knowledge.retrieve(tenantId, opts.text, { k: 4 }),
      this.prisma.withTenant(tenantId, (tx) =>
        tx.customFieldDefinition.findMany({
          where: { entityType: 'PROFILE', extractable: true, archivedAt: null },
          orderBy: { order: 'asc' },
        }),
      ),
      opts.profileId
        ? this.prisma.withTenant(tenantId, (tx) =>
            tx.profile.findUnique({
              where: { id: opts.profileId! },
              select: { name: true, lifecycleState: true, custom: true },
            }),
          )
        : null,
    ]);

    const system = buildEngineSystem({
      tenantName: tenant?.name ?? 'la empresa',
      instructions: instructions.map((i) => i.content),
      blocks,
      profile: profile as never,
      channel: opts.channel,
      extractableCount: extractableDefs.length,
    });

    // 2. Una sola llamada: respuesta + extracción + laguna + consentimiento.
    const extractionSchema = buildExtractionSchema(extractableDefs as ExtractableFieldDef[]);
    const historyText = opts.history
      .slice(-8)
      .map((m) => `${m.direction === 'IN' ? 'Cliente' : 'Tú'}: ${m.body}`)
      .join('\n');

    const call = await this.ai.callWithTool<EngineToolOutput>({
      tenantId,
      model: this.ai.modelFor('converse'),
      system,
      userPrompt: `${historyText ? `CONVERSACIÓN PREVIA:\n${historyText}\n\n` : ''}MENSAJE DEL CLIENTE:\n${opts.text}`,
      toolName: 'responder',
      toolDescription:
        'Responde al cliente y estructura lo aprendido en este turno. reply = tu respuesta literal para el cliente.',
      toolInputSchema: {
        type: 'object',
        properties: {
          reply: { type: 'string', description: 'Respuesta literal para el cliente, en su idioma.' },
          can_answer: {
            type: 'boolean',
            description: 'false si FUENTES no cubría la pregunta y has tenido que ofrecer contacto humano.',
          },
          wants_contact: {
            type: 'object',
            description: 'Solo si el cliente ACEPTA explícitamente que el equipo le contacte.',
            properties: {
              accepted: { type: 'boolean' },
              channel: { type: 'string', enum: ['email', 'phone'] },
              value: { type: 'string', description: 'El email o teléfono que haya dado, tal cual.' },
            },
          },
          extracted: extractionSchema,
        },
        required: ['reply', 'can_answer'],
      },
      maxTokens: 700,
    });

    const out = call.result;
    const result: EngineResult = {
      reply: out.reply?.trim() || 'Ahora mismo no puedo responderte — el equipo te contactará en breve.',
      canAnswer: out.can_answer !== false,
      extractedKeys: [],
      consentGranted: false,
    };

    // 3. Extracción → perfil (validada contra definiciones; nunca inventa claves).
    if (opts.profileId && out.extracted && extractableDefs.length) {
      const clean = sanitizeExtraction(extractableDefs as ExtractableFieldDef[], out.extracted);
      if (Object.keys(clean).length) {
        try {
          const validated = await this.customFields.validateValues(tenantId, 'PROFILE', clean, {
            partial: true,
          });
          await this.prisma.withTenant(tenantId, async (tx) => {
            const current = await tx.profile.findUnique({
              where: { id: opts.profileId! },
              select: { custom: true },
            });
            await tx.profile.update({
              where: { id: opts.profileId! },
              data: { custom: { ...((current?.custom as object) ?? {}), ...(validated as object) } as never },
            });
          });
          result.extractedKeys = Object.keys(clean);
        } catch (err) {
          this.logger.warn(`extracción no persistida: ${(err as Error).message}`);
        }
      }
    }

    // 4. Laguna: el motor no sabía → registrar (prioritaria si hay lead esperando).
    if (!result.canAnswer) {
      try {
        const gap = await this.knowledge.recordGap(tenantId, opts.text, {
          hasWaitingLead: opts.leadWaiting ?? Boolean(opts.profileId),
        });
        result.gapId = gap.id;
      } catch (err) {
        this.logger.warn(`laguna no registrada: ${(err as Error).message}`);
      }
    }

    // 5. Aceptación de contacto → consentimiento con evidencia LITERAL.
    if (out.wants_contact?.accepted && opts.profileId) {
      const channel = out.wants_contact.channel === 'phone' ? 'phone' : 'email';
      try {
        if (out.wants_contact.value) {
          await this.profiles.resolveForEvent(
            tenantId,
            channel === 'phone' ? { phone: out.wants_contact.value } : { email: out.wants_contact.value },
            { source: 'webchat' },
          );
        }
        await this.consents.grant(tenantId, opts.profileId, channel, 'followup', {
          at: new Date().toISOString(),
          where: `conversation:${opts.channel.toLowerCase()}`,
          textShown: opts.text,
        });
        result.consentGranted = true;
      } catch (err) {
        this.logger.warn(`consentimiento no registrado: ${(err as Error).message}`);
      }
    }

    void this.ai.recordUsage({
      tenantId,
      feature: 'conversation_engine',
      callResult: call,
      resourceType: 'conversation',
      metadata: {
        channel: opts.channel,
        canAnswer: result.canAnswer,
        extracted: result.extractedKeys,
        gap: Boolean(result.gapId),
        sources: blocks.length,
      },
    });

    return result;
  }
}
