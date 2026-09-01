import { describe, it, expect } from 'vitest';
import { buildReplyAllRecipients } from '@converflow/shared';

/**
 * Regresión del bug «Responder a todos elimina los CC».
 *
 * La causa: el cliente construía el CC desde thread.participants, y los hilos
 * creados por un correo ENTRANTE guardaban participants = [remitente] — los CC
 * nunca estaban ahí. Esta función es ahora la única fuente de la verdad para
 * ambos lados, así que estos tests fijan el contrato completo.
 */
describe('buildReplyAllRecipients', () => {
  const BOX = 'ventas@empresa.com';

  it('varios CC: conserva todos y responde al remitente', () => {
    const r = buildReplyAllRecipients(
      {
        fromAddress: 'ana@acme.test',
        toAddresses: ['ventas@empresa.com'],
        ccAddresses: ['compras@acme.test', 'direccion@acme.test'],
      },
      [BOX],
    );
    expect(r.to).toBe('ana@acme.test');
    expect(r.cc).toEqual(['compras@acme.test', 'direccion@acme.test']);
  });

  it('el propio usuario en CC: se excluye (no te copias a ti mismo)', () => {
    const r = buildReplyAllRecipients(
      {
        fromAddress: 'ana@acme.test',
        toAddresses: ['otro@tercero.test'],
        ccAddresses: ['Ventas@Empresa.com', 'compras@acme.test'],
      },
      [BOX],
    );
    expect(r.cc).toEqual(['otro@tercero.test', 'compras@acme.test']);
    // Y la exclusión es case-insensitive: 'Ventas@' cayó igualmente.
    expect(r.cc.map((c) => c.toLowerCase())).not.toContain(BOX);
  });

  it('alias del buzón: todas las direcciones propias quedan fuera', () => {
    const r = buildReplyAllRecipients(
      {
        fromAddress: 'ana@acme.test',
        toAddresses: ['info@empresa.com', 'ventas@empresa.com'],
        ccAddresses: ['compras@acme.test'],
      },
      [BOX, 'info@empresa.com'],
    );
    expect(r.to).toBe('ana@acme.test');
    expect(r.cc).toEqual(['compras@acme.test']);
  });

  it('Reply-To presente: manda sobre el From (RFC 5322 §3.6.2)', () => {
    const r = buildReplyAllRecipients(
      {
        fromAddress: 'notificaciones@plataforma.test',
        replyTo: 'persona.real@acme.test',
        toAddresses: ['ventas@empresa.com'],
        ccAddresses: ['compras@acme.test'],
      },
      [BOX],
    );
    expect(r.to).toBe('persona.real@acme.test');
    // El From original NO entra en copia: el remitente fijó Reply-To
    // precisamente porque no quiere correo ahí (caso típico: notificaciones@).
    // Es también lo que hace Gmail.
    expect(r.cc).toEqual(['compras@acme.test']);
    expect(r.cc).not.toContain('notificaciones@plataforma.test');
  });

  it('sin duplicados aunque la misma dirección venga en from, to y cc', () => {
    const r = buildReplyAllRecipients(
      {
        fromAddress: 'ana@acme.test',
        toAddresses: ['ventas@empresa.com', 'ANA@acme.test'],
        ccAddresses: ['ana@acme.test', 'compras@acme.test', 'Compras@ACME.test'],
      },
      [BOX],
    );
    expect(r.to).toBe('ana@acme.test');
    expect(r.cc).toEqual(['compras@acme.test']);
  });

  it('el remitente somos nosotros (p. ej. eco propio): el To cae al primer tercero', () => {
    const r = buildReplyAllRecipients(
      {
        fromAddress: 'ventas@empresa.com',
        toAddresses: ['ana@acme.test'],
        ccAddresses: ['compras@acme.test'],
      },
      [BOX],
    );
    expect(r.to).toBe('ana@acme.test');
    expect(r.cc).toEqual(['compras@acme.test']);
  });

  it('entrada vacía o nula no revienta', () => {
    expect(buildReplyAllRecipients({}, [BOX])).toEqual({ to: '', cc: [] });
    expect(
      buildReplyAllRecipients({ fromAddress: null, toAddresses: null, ccAddresses: null }, []),
    ).toEqual({ to: '', cc: [] });
  });
});
