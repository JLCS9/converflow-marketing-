import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { NotFoundError, UnauthorizedError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ConsentsService } from '../consents/consents.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { IngestQueue } from './ingest.queue.js';
import { TRANSLATORS, translateGeneric, verifyHmacSignature } from './adapters/adapters.js';

/**
 * Receptor público de webhooks del plano de datos (F1). La URL contiene el
 * id de la fuente (cuid no adivinable, revocable con active=false), igual
 * que el patrón del webchat con botId. Si la fuente tiene `secret`, la
 * firma HMAC se verifica sobre el RAW BODY; Brevo no firma → su protección
 * es la URL secreta + el rate limit global.
 *
 * Contrato con los emisores: SIEMPRE 202 ante payloads raros (0 eventos) —
 * responder 4xx/5xx a un webhook malformado solo provoca tormentas de
 * reintentos del proveedor.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestQueue,
    private readonly profiles: ProfilesService,
    private readonly consents: ConsentsService,
  ) {}

  @Post(':sourceId')
  @HttpCode(202)
  async receive(
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-wc-webhook-signature') wcSignature?: string,
    @Headers('x-webhook-signature') genericSignature?: string,
  ) {
    // Resolución de tenant vía bypass (misma técnica que webchat/botId): la
    // fila de la fuente ES la autorización de la ruta.
    const source = await this.prisma.bypass((tx) =>
      tx.ingestSource.findUnique({ where: { id: sourceId } }),
    );
    if (!source || !source.active) throw new NotFoundError('Fuente no encontrada');

    if (source.secret) {
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
      const ok = verifyHmacSignature(raw, source.secret, wcSignature ?? genericSignature);
      if (!ok) throw new UnauthorizedError();
    }

    const translate = TRANSLATORS[source.kind];
    const batch = translate ? translate(body) : translateGeneric(body, source.kind);

    if (batch.events.length > 0) {
      await this.queue.enqueueBatch(source.tenantId, batch);
      // Bajas de email → consentimiento revocado con evidencia (además del
      // evento email_unsubscribe que alimenta el ciclo de vida).
      for (const ev of batch.events) {
        if (ev.type !== 'email_unsubscribe' || !ev.identity?.email) continue;
        const profile = await this.profiles.resolveForEvent(
          source.tenantId,
          { email: ev.identity.email },
          { source: source.kind },
        );
        if (profile) {
          await this.consents.revoke(source.tenantId, profile.id, 'email', 'marketing', {
            at: new Date().toISOString(),
            where: `webhook:${source.kind}`,
            textShown: 'Baja registrada por el proveedor de email del tenant.',
          });
        }
      }
    }

    await this.prisma.bypass((tx) =>
      tx.ingestSource.update({
        where: { id: source.id },
        data: { received: { increment: batch.events.length }, lastEventAt: new Date() },
      }),
    );

    return { accepted: batch.events.length };
  }
}
