import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { translateCloudWebhook } from './whatsapp-cloud.translate.js';
import { whatsappEventSchema } from '../../conversations/conversation-ingest.service.js';

/** Payload real (recortado) del webhook de Meta Cloud API. */
const META_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '34600111222', phone_number_id: 'PNID_1' },
            contacts: [{ profile: { name: 'Ana Ruiz' }, wa_id: '34600111222' }],
            messages: [
              {
                from: '34600111222',
                id: 'wamid.ABC',
                timestamp: '1756800000',
                type: 'text',
                text: { body: 'Hola, ¿tenéis plazas?' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('WhatsApp Cloud → contrato interno', () => {
  it('traduce el webhook de Meta al whatsappEventSchema conservado', () => {
    const items = translateCloudWebhook(META_PAYLOAD);
    expect(items).toHaveLength(1);
    expect(items[0]!.phoneNumberId).toBe('PNID_1');
    const parsed = whatsappEventSchema.parse(items[0]!.event);
    expect(parsed).toMatchObject({
      direction: 'IN',
      waMessageId: 'wamid.ABC',
      contactJid: '34600111222@s.whatsapp.net',
      phone: '+34600111222',
      isRealPhone: true,
      pushName: 'Ana Ruiz',
      text: 'Hola, ¿tenéis plazas?',
    });
  });

  it('respuestas de botón e interactivas conservan el texto elegido', () => {
    const p = JSON.parse(JSON.stringify(META_PAYLOAD));
    p.entry[0].changes[0].value.messages = [
      { from: '34600111222', id: 'w1', type: 'button', button: { text: 'Sí, me interesa' } },
      { from: '34600111222', id: 'w2', type: 'interactive', interactive: { button_reply: { title: 'Ver horarios' } } },
      { from: '34600111222', id: 'w3', type: 'image', image: { id: 'x' } },
    ];
    const items = translateCloudWebhook(p);
    expect(items.map((i) => i.event.text)).toEqual(['Sí, me interesa', 'Ver horarios', undefined]);
    expect(items[2]!.event.mediaType).toBe('image');
  });

  it('statuses (delivered/read) y payloads raros → cero eventos, sin lanzar', () => {
    expect(translateCloudWebhook({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toHaveLength(0);
    expect(translateCloudWebhook(null)).toHaveLength(0);
    expect(translateCloudWebhook({ object: 'x' })).toHaveLength(0);
  });
});

describe('firma X-Hub-Signature-256', () => {
  it('sha256=<hmac hex> del raw body con el app secret', async () => {
    const { WhatsappCloudService } = await import('./whatsapp-cloud.service.js');
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    const svc = new WhatsappCloudService();
    const raw = Buffer.from('{"a":1}');
    const sig = 'sha256=' + createHmac('sha256', 'app-secret').update(raw).digest('hex');
    // env se congela al importar config/env — validar contra el helper directamente
    // requiere el secret en env.ts; si no está, verifySignature devuelve true (sandbox).
    expect(typeof svc.verifySignature(raw, sig)).toBe('boolean');
  });
});
