/**
 * Traducción del webhook de WhatsApp Meta Cloud API al contrato interno
 * whatsappEventSchema (F2). El contrato se conserva a propósito: es la
 * frontera que hace intercambiable el transporte (Baileys hoy, Cloud API
 * mañana) sin tocar la ingesta ni el CRM.
 *
 * Pérdidas conocidas frente a Baileys (asumidas en el plan): no hay eco de
 * mensajes enviados desde el móvil, y los envíos fuera de la ventana de 24h
 * requieren plantilla aprobada.
 */

export interface CloudInbound {
  phoneNumberId: string;
  event: {
    direction: 'IN';
    waMessageId?: string;
    contactJid: string;
    phone: string;
    isRealPhone: boolean;
    pushName?: string;
    text?: string;
    mediaType?: string;
  };
}

const s = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** Extrae los mensajes entrantes de un POST del webhook de Meta. */
export function translateCloudWebhook(payload: unknown): CloudInbound[] {
  const out: CloudInbound[] = [];
  const body = payload as { entry?: unknown[] } | null;
  for (const entry of body?.entry ?? []) {
    const changes = (entry as { changes?: unknown[] }).changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value ?? {};
      const phoneNumberId = s((value.metadata as Record<string, unknown> | undefined)?.phone_number_id);
      if (!phoneNumberId) continue;
      const contacts = (value.contacts as { wa_id?: string; profile?: { name?: string } }[]) ?? [];
      const nameByWaId = new Map(contacts.map((c) => [c.wa_id, c.profile?.name]));
      for (const msg of (value.messages as Record<string, unknown>[]) ?? []) {
        const from = s(msg.from);
        if (!from) continue;
        const type = s(msg.type) ?? 'text';
        const text =
          type === 'text'
            ? s((msg.text as { body?: string } | undefined)?.body)
            : type === 'button'
              ? s((msg.button as { text?: string } | undefined)?.text)
              : type === 'interactive'
                ? s(
                    ((msg.interactive as Record<string, { title?: string }> | undefined)?.button_reply ??
                      (msg.interactive as Record<string, { title?: string }> | undefined)?.list_reply)?.title,
                  )
                : undefined;
        out.push({
          phoneNumberId,
          event: {
            direction: 'IN',
            waMessageId: s(msg.id),
            contactJid: `${from}@s.whatsapp.net`,
            phone: `+${from}`,
            isRealPhone: true, // Cloud API entrega el número real siempre
            pushName: nameByWaId.get(from),
            text,
            mediaType: type !== 'text' && type !== 'button' && type !== 'interactive' ? type : undefined,
          },
        });
      }
    }
  }
  return out;
}
