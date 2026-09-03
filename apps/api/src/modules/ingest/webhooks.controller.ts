import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { NotFoundError, UnauthorizedError, catalogBatchSchema } from '@converflow/shared';
import type { IngestSource } from '@converflow/db';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ConsentsService } from '../consents/consents.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
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
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Resolución de tenant vía bypass (misma técnica que webchat/botId): la
   * fila de la fuente ES la autorización de la ruta. Compartida por el
   * endpoint de eventos y el de catálogo — misma fuente, misma firma.
   */
  private async resolveAndVerifySource(
    sourceId: string,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<IngestSource> {
    const source = await this.prisma.bypass((tx) =>
      tx.ingestSource.findUnique({ where: { id: sourceId } }),
    );
    if (!source || !source.active) throw new NotFoundError('Fuente no encontrada');
    if (source.secret) {
      const ok = verifyHmacSignature(rawBody, source.secret, signature);
      if (!ok) throw new UnauthorizedError();
    }
    return source;
  }

  @Post(':sourceId')
  @HttpCode(202)
  async receive(
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-wc-webhook-signature') wcSignature?: string,
    @Headers('x-webhook-signature') genericSignature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    const source = await this.resolveAndVerifySource(sourceId, raw, wcSignature ?? genericSignature);

    const translate = TRANSLATORS[source.kind];
    const batch = translate ? translate(body) : translateGeneric(body, source.kind);
    // El `source` que devuelve el traductor es el NOMBRE del adaptador
    // ('woocommerce', 'brevo'...) — genérico entre TODAS las fuentes de ese
    // kind del tenant. Un tenant puede tener varias fuentes del mismo kind
    // (varias tiendas WooCommerce, p. ej. una por idioma) cuyo `externalId`
    // (p. ej. "order:4831") NO es único entre instalaciones distintas.
    // Se sobrescribe con el id de ESTA fuente para que el dedupe
    // [tenantId, source, externalId] nunca cruce datos de una fuente con
    // los de otra homónima.
    batch.source = source.id;

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

  /**
   * Catálogo (productos/cursos/servicios) — endpoint APARTE del de eventos:
   * `Event` es append-only (dedupe único por externalId), mientras que un
   * ítem de catálogo se ACTUALIZA (precio, disponibilidad) con el mismo
   * externalId una y otra vez. Mismo contrato de "siempre 202, nunca 4xx a
   * un payload raro" que el endpoint de eventos.
   */
  @Post(':sourceId/catalog')
  @HttpCode(202)
  async receiveCatalog(
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-wc-webhook-signature') wcSignature?: string,
    @Headers('x-webhook-signature') genericSignature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    const source = await this.resolveAndVerifySource(sourceId, raw, wcSignature ?? genericSignature);

    const parsed = catalogBatchSchema.safeParse(body);
    if (!parsed.success) return { upserted: 0 };

    // Mismo motivo que en receive(): source.id, no source.kind — varias
    // tiendas del mismo kind no deben compartir el espacio de externalId
    // de su catálogo (el producto "213" de una tienda no es el "213" de otra).
    const { upserted } = await this.catalog.upsertBatch(source.tenantId, source.id, parsed.data.items);

    await this.prisma.bypass((tx) =>
      tx.ingestSource.update({ where: { id: source.id }, data: { lastEventAt: new Date() } }),
    );
    // Contador visible en Ajustes — no-op silencioso si esta fuente no tiene
    // EcommerceConnection asociada (brevo/learndash/generic no la tienen).
    if (upserted > 0) {
      await this.prisma.withTenant(source.tenantId, (tx) =>
        tx.ecommerceConnection.updateMany({
          where: { ingestSourceId: source.id },
          data: { productsImported: { increment: upserted }, lastSyncedAt: new Date() },
        }),
      );
    }

    return { upserted };
  }
}
