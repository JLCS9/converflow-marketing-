import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { AiService } from '../../../common/ai/ai.service.js';
import { PipelinesService } from '../../pipelines/pipelines.service.js';

interface ScoreOneOpts {
  agentId: string | null;
  updateStatus: boolean;
  createOpportunities: boolean;
}

interface ScoreOneResult {
  statusUpdated: boolean;
  oppCreated: boolean;
}

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

/**
 * Scoring runner — strategy implementation for Agent.type === 'OPPORTUNITIES'.
 *
 * Takes one lead, optionally injects an agent's systemPrompt as funnel rules,
 * asks Claude for a structured score + (optional) status decision + (optional)
 * opportunity hint, persists everything in a single transaction.
 */
@Injectable()
export class ScoringRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly pipelines: PipelinesService,
  ) {}

  async scoreOne(
    tenantId: string,
    leadId: string,
    opts: ScoreOneOpts,
  ): Promise<ScoreOneResult> {
    const lead = await this.prisma.withTenant(tenantId, (tx) =>
      tx.lead.findUnique({ where: { id: leadId } }),
    );
    if (!lead) throw new NotFoundError(`Lead ${leadId} no encontrado`);

    // Funnel rules from the chosen Agent (if any). We feed name + description
    // + systemPrompt verbatim so the user controls tone and rules in one place.
    let funnelRules: string | null = null;
    if (opts.agentId) {
      const agent = await this.prisma.withTenant(tenantId, (tx) =>
        tx.agent.findUnique({
          where: { id: opts.agentId! },
          select: { name: true, description: true, systemPrompt: true, type: true },
        }),
      );
      if (agent) {
        funnelRules = [
          agent.name ? `Agente: ${agent.name}.` : null,
          agent.description ? `Descripción: ${agent.description}.` : null,
          agent.systemPrompt
            ? `Reglas del funnel:\n${agent.systemPrompt}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    const defaultPipeline = opts.createOpportunities
      ? await this.pipelines.getDefault(tenantId).catch(() => null)
      : null;
    const defaultStage = defaultPipeline?.stages?.[0] ?? null;

    const customFields = lead.customFields
      ? JSON.stringify(lead.customFields, null, 2)
      : '(sin campos)';

    const userPrompt = [
      'Analiza este lead comercial y dale un score de 0 a 100 según su potencial de cierre.',
      '',
      `Nombre: ${lead.name}${lead.lastName ? ' ' + lead.lastName : ''}`,
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
      funnelRules
        ? `Reglas del funnel del tenant (aplícalas si encajan):\n${funnelRules}`
        : 'Sin reglas específicas del tenant. Usa criterios estándar B2B España.',
      '',
      opts.updateStatus
        ? 'Si las reglas o los datos lo indican claramente, decide el estado (LEAD, CLIENT o LOST) en `statusDecision`. Usa NO_CHANGE si no es claro.'
        : 'No decidas estado.',
      opts.createOpportunities
        ? 'Si el lead tiene interés claro en un producto/servicio, devuelve `opportunityHint` con nombre y estimación opcional de importe.'
        : 'No crees oportunidades.',
      '',
      'Devuelve el resultado vía la herramienta `submit_lead_score`.',
    ].join('\n');

    const call = await this.ai.callWithTool<ScoreBatchOutput>({
      system:
        'Eres un analista comercial senior B2B en España. Devuelves resultados estructurados y concisos en castellano.',
      userPrompt,
      toolName: 'submit_lead_score',
      toolDescription:
        'Submit the lead score, priority, reasoning, recommended actions, optional status decision and optional opportunity hint.',
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
          },
          opportunityHint: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['score', 'priority', 'reasoning', 'recommendedActions'],
      },
      maxTokens: 800,
    });

    let statusUpdated = false;
    let oppCreated = false;

    await this.prisma.withTenant(tenantId, async (tx) => {
      const newStatus: 'LEAD' | 'CLIENT' | 'LOST' | null =
        opts.updateStatus &&
        call.result.statusDecision &&
        call.result.statusDecision !== 'NO_CHANGE' &&
        call.result.statusDecision !== lead.status
          ? (call.result.statusDecision as 'LEAD' | 'CLIENT' | 'LOST')
          : null;

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
      if (newStatus) statusUpdated = true;

      if (newStatus === 'CLIENT') {
        const existing = lead.email
          ? await tx.client.findFirst({ where: { email: lead.email } })
          : null;
        if (!existing) {
          await tx.client.create({
            data: {
              tenantId,
              name: lead.name,
              lastName: lead.lastName,
              email: lead.email,
              phone: lead.phone,
              source: lead.source,
              status: 'ACTIVE',
            },
          });
        }
      }

      if (
        opts.createOpportunities &&
        defaultPipeline &&
        defaultStage &&
        call.result.opportunityHint?.name
      ) {
        await tx.opportunity.create({
          data: {
            tenantId,
            leadId: lead.id,
            name: call.result.opportunityHint.name.slice(0, 150),
            amount: call.result.opportunityHint.amount ?? null,
            currency: 'EUR',
            status: 'OPEN',
            probability: Math.min(100, Math.max(0, call.result.score)),
            pipelineId: defaultPipeline.id,
            stageId: defaultStage.id,
          },
        });
        oppCreated = true;
      }
    });

    void this.ai.recordUsage({
      tenantId,
      feature: 'lead_scoring_batch',
      callResult: call,
      resourceType: 'lead',
      resourceId: lead.id,
    });

    return { statusUpdated, oppCreated };
  }
}
