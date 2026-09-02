import type { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * Atención autónoma · Ficha CRM del contacto por email, compartida entre el
 * asistente de redacción (mail-draft-ai) y la auto-respuesta. «Lo que sabemos
 * del cliente» entra al prompt como bloque de userPrompt (jamás al system).
 */
export async function gatherCrmContext(prisma: PrismaService, tenantId: string, address: string | null) {
  return prisma.withTenant(tenantId, async (tx) => {
    const email = (address ?? '').trim().toLowerCase();
    const lead = email
      ? await tx.lead.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true, name: true, company: true, status: true, score: true, source: true },
        })
      : null;
    const client = !lead && email
      ? await tx.client.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true, name: true, status: true },
        })
      : null;

    const opportunities = lead
      ? await tx.opportunity.findMany({
          where: { leadId: lead.id, status: 'OPEN' },
          orderBy: { updatedAt: 'desc' },
          take: 3,
          select: {
            name: true,
            amount: true,
            currency: true,
            expectedCloseDate: true,
            stage: { select: { label: true } },
          },
        })
      : [];

    const notes = lead
      ? await tx.note.findMany({
          where: { leadId: lead.id },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { body: true, createdAt: true },
        })
      : [];

    return { email, lead, client, opportunities, notes };
  });
}

export type CrmContext = Awaited<ReturnType<typeof gatherCrmContext>>;

export function crmContextBlock(ctx: CrmContext): string {
  const lines: string[] = ['FICHA DEL CONTACTO (de nuestro CRM):'];
  if (ctx.lead) {
    lines.push(
      `- Lead: ${ctx.lead.name}${ctx.lead.company ? ` (${ctx.lead.company})` : ''}` +
        ` · estado ${ctx.lead.status}` +
        (ctx.lead.score != null ? ` · puntuación ${ctx.lead.score}/100` : '') +
        (ctx.lead.source ? ` · origen ${ctx.lead.source}` : ''),
    );
  } else if (ctx.client) {
    lines.push(`- Cliente: ${ctx.client.name} · estado ${ctx.client.status}`);
  } else {
    lines.push('- Sin ficha en el CRM.');
  }
  for (const o of ctx.opportunities) {
    lines.push(
      `- Oportunidad abierta: ${o.name}` +
        (o.amount ? ` · ${o.amount.toString()} ${o.currency}` : '') +
        (o.stage?.label ? ` · etapa ${o.stage.label}` : '') +
        (o.expectedCloseDate ? ` · cierre previsto ${o.expectedCloseDate.toISOString().slice(0, 10)}` : ''),
    );
  }
  for (const n of ctx.notes) {
    lines.push(`- Nota (${n.createdAt.toISOString().slice(0, 10)}): ${n.body.slice(0, 200)}`);
  }
  return lines.join('\n');
}
