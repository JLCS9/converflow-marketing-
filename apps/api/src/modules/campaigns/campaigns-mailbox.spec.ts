import { describe, it, expect, vi } from 'vitest';
import { CampaignsService } from './campaigns.service.js';

/**
 * Cómo elige una campaña el buzón desde el que sale.
 *
 * Importa más de lo que parece: el formulario le dice al usuario que enviará
 * «desde el buzón del bot» y muestra esa dirección, así que resolver otra sería
 * mentirle sobre el remitente de un envío masivo.
 */
function makeService(over: {
  bot?: { phoneNumber: string | null } | null;
  mailByAddress?: unknown;
  mailShared?: unknown;
  legacy?: unknown;
} = {}) {
  const findFirstMail = vi
    .fn()
    // 1ª llamada: por dirección del bot. 2ª: cualquiera compartido.
    .mockResolvedValueOnce(over.mailByAddress ?? null)
    .mockResolvedValueOnce(over.mailShared ?? null);
  const tx = {
    bot: { findUnique: vi.fn().mockResolvedValue(over.bot ?? null) },
    mailConnection: { findFirst: findFirstMail },
    emailConnection: { findFirst: vi.fn().mockResolvedValue(over.legacy ?? null) },
  };
  const prisma = {
    withTenant: (_t: string, fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
  } as never;
  const svc = new CampaignsService(prisma, {} as never, {} as never);
  return { svc, findFirstMail, tx };
}

const mailBox = (fromAddress: string) => ({
  fromAddress,
  displayName: 'Ventas',
  smtpHost: 's',
  smtpPort: 587,
  imapHost: 'i',
  imapPort: 993,
  username: 'u',
  secretEnc: 'enc',
  smtpSecure: null,
  imapSecure: null,
  secure: true,
});

describe('CampaignsService — buzón de envío', () => {
  it('usa el buzón cuya dirección coincide con la del bot', async () => {
    const { svc } = makeService({
      bot: { phoneNumber: 'ventas@empresa.com' },
      mailByAddress: mailBox('ventas@empresa.com'),
    });
    const box = await svc['resolveEmailConn']('t', 'bot1');
    expect(box).toMatchObject({ source: 'mail', fromAddress: 'ventas@empresa.com' });
  });

  it('busca por la dirección del bot en minúsculas', async () => {
    const { svc, tx } = makeService({
      bot: { phoneNumber: '  Ventas@Empresa.COM ' },
      mailByAddress: mailBox('ventas@empresa.com'),
    });
    await svc['resolveEmailConn']('t', 'bot1');
    const where = (tx.mailConnection.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.fromAddress.equals).toBe('ventas@empresa.com');
  });

  it('cae al buzón compartido si ninguno coincide con el bot', async () => {
    const { svc } = makeService({
      bot: { phoneNumber: 'otra@empresa.com' },
      mailByAddress: null,
      mailShared: mailBox('equipo@empresa.com'),
    });
    const box = await svc['resolveEmailConn']('t', 'bot1');
    expect(box).toMatchObject({ source: 'mail', fromAddress: 'equipo@empresa.com' });
  });

  it('nunca elige un buzón privado: el respaldo exige visibility SHARED', async () => {
    const { svc, tx } = makeService({ bot: { phoneNumber: null }, mailShared: mailBox('e@e.com') });
    await svc['resolveEmailConn']('t', 'bot1');
    const calls = (tx.mailConnection.findFirst as ReturnType<typeof vi.fn>).mock.calls;
    // Sin dirección de bot solo se hace la consulta del respaldo.
    expect(calls[0]![0].where.visibility).toBe('SHARED');
  });

  it('acepta un buzón DEGRADED: un fallo transitorio de IMAP no impide enviar por SMTP', async () => {
    const { svc, tx } = makeService({ bot: { phoneNumber: null }, mailShared: mailBox('e@e.com') });
    await svc['resolveEmailConn']('t', 'bot1');
    const where = (tx.mailConnection.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.status.in).toContain('DEGRADED');
  });

  it('cae al EmailConnection heredado mientras coexistan los dos sistemas', async () => {
    const { svc } = makeService({
      bot: { phoneNumber: 'ventas@empresa.com' },
      legacy: {
        email: 'viejo@empresa.com',
        smtpHost: 's',
        smtpPort: 465,
        imapHost: 'i',
        imapPort: 993,
        username: 'u',
        passwordEnc: 'enc',
        secure: true,
      },
    });
    const box = await svc['resolveEmailConn']('t', 'bot1');
    expect(box).toMatchObject({ source: 'legacy', fromAddress: 'viejo@empresa.com' });
  });

  it('devuelve null cuando no hay ningún buzón, en vez de inventarse un remitente', async () => {
    const { svc } = makeService({ bot: { phoneNumber: null } });
    expect(await svc['resolveEmailConn']('t', 'bot1')).toBeNull();
  });

  it('devuelve null sin bot y sin buzón compartido', async () => {
    const { svc } = makeService();
    expect(await svc['resolveEmailConn']('t', null)).toBeNull();
  });
});
