/**
 * Espejo Lead→Client: cuando un Lead pasa a CLIENT, se refleja en la tabla
 * Client (compatibilidad — tareas y oportunidades siguen referenciando
 * Client, el modelo unificado vive en Lead). Reutiliza un Client existente
 * por email antes de crear uno nuevo.
 *
 * Extraído de LeadsService.update() para que el mismo espejo lo use también
 * CrmSyncService (auto-alta de Cliente desde una compra de e-commerce) sin
 * duplicar la lógica ni depender de LeadsService vía DI.
 */

interface MirrorTx {
  client: {
    findFirst(args: { where: { email: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        tenantId: string;
        name: string;
        email: string | null;
        phone: string | null;
        source: string | null;
        ownerId: string | null;
        status: 'ACTIVE';
      };
    }): Promise<{ id: string }>;
  };
}

interface MirrorableLead {
  clientId: string | null;
  email: string | null;
  company: string | null;
  name: string;
  phone: string | null;
  source: string | null;
  ownerId: string | null;
}

/** Devuelve el clientId a persistir en el Lead: el existente, o uno nuevo/reutilizado. */
export async function mirrorLeadToClient(
  tx: MirrorTx,
  tenantId: string,
  lead: MirrorableLead,
): Promise<string> {
  if (lead.clientId) return lead.clientId;
  const existing = lead.email ? await tx.client.findFirst({ where: { email: lead.email } }) : null;
  if (existing) return existing.id;
  const client = await tx.client.create({
    data: {
      tenantId,
      name: lead.company?.trim() || lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      ownerId: lead.ownerId,
      status: 'ACTIVE',
    },
  });
  return client.id;
}
