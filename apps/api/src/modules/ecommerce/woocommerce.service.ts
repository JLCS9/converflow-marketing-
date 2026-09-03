import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError, UnauthorizedError, type EcommerceRegisterInput } from '@converflow/shared';
import { hashApiKey, safeHashEquals } from '../../common/auth/api-key.util.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { env } from '../../config/env.js';

const CONNECTION_KEY_PREFIX = 'cfwc_';
const CONNECTION_KEY_TTL_MS = 30 * 60_000; // 30 min, un solo uso

function generateConnectionKey(): { secret: string; prefix: string; hash: string } {
  const body = randomBytes(24).toString('base64url');
  const secret = `${CONNECTION_KEY_PREFIX}${body}`;
  return { secret, prefix: secret.slice(0, CONNECTION_KEY_PREFIX.length + 6), hash: hashApiKey(secret) };
}

function webhookUrls(sourceId: string) {
  return {
    events: `${env.API_PUBLIC_URL}/webhooks/${sourceId}`,
    catalog: `${env.API_PUBLIC_URL}/webhooks/${sourceId}/catalog`,
  };
}

/**
 * Integración WooCommerce (y Shopify el día de mañana, mismo contrato):
 * handshake de un solo uso para el plugin propio de WordPress + estado de
 * la conexión visible en Ajustes. El secreto que firma cada webhook de
 * verdad (`IngestSource.secret`) lo genera SIEMPRE el servidor — la clave
 * de conexión que el humano copia solo sirve para el apretón de manos
 * inicial y expira sola.
 */
@Injectable()
export class WoocommerceService {
  private readonly logger = new Logger(WoocommerceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Genera (o regenera) la clave de conexión de un solo uso para este tenant. */
  async connect(tenantId: string) {
    const { secret, prefix, hash } = generateConnectionKey();
    const expiresAt = new Date(Date.now() + CONNECTION_KEY_TTL_MS);

    await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.ecommerceConnection.findUnique({
        where: { tenantId_provider: { tenantId, provider: 'WOOCOMMERCE' } },
      });
      if (existing) {
        await tx.ecommerceConnection.update({
          where: { id: existing.id },
          data: { connectionKeyPrefix: prefix, connectionKeyHash: hash, connectionKeyExpiresAt: expiresAt },
        });
        return;
      }
      const source = await tx.ingestSource.create({
        data: { tenantId, kind: 'woocommerce', name: 'WooCommerce', active: false },
      });
      await tx.ecommerceConnection.create({
        data: {
          tenantId,
          provider: 'WOOCOMMERCE',
          ingestSourceId: source.id,
          connectionKeyPrefix: prefix,
          connectionKeyHash: hash,
          connectionKeyExpiresAt: expiresAt,
        },
      });
    });

    return {
      connectionKey: secret,
      expiresAt: expiresAt.toISOString(),
      webhookBaseUrl: env.API_PUBLIC_URL,
    };
  }

  async status(tenantId: string) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.ecommerceConnection.findUnique({
        where: { tenantId_provider: { tenantId, provider: 'WOOCOMMERCE' } },
        select: {
          status: true,
          storeName: true,
          storeUrl: true,
          pluginVersion: true,
          lastError: true,
          lastSyncedAt: true,
          ordersImported: true,
          productsImported: true,
          connectedAt: true,
        },
      }),
    );
    return conn ?? { status: 'DISCONNECTED' as const };
  }

  /** Corta el grifo: el plugin viejo deja de poder entregar webhooks al instante. */
  async disconnect(tenantId: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const conn = await tx.ecommerceConnection.findUnique({
        where: { tenantId_provider: { tenantId, provider: 'WOOCOMMERCE' } },
      });
      if (!conn) throw new NotFoundError('No hay ninguna tienda conectada');
      await tx.ingestSource.update({ where: { id: conn.ingestSourceId }, data: { active: false } });
      await tx.ecommerceConnection.update({
        where: { id: conn.id },
        data: {
          status: 'DISCONNECTED',
          disconnectedAt: new Date(),
          connectionKeyPrefix: null,
          connectionKeyHash: null,
          connectionKeyExpiresAt: null,
        },
      });
    });
    return { ok: true };
  }

  /**
   * Handshake público del plugin recién instalado. Sin guard de sesión — la
   * autorización es la propia clave de conexión (misma técnica que la fila
   * de IngestSource en /webhooks/:sourceId). Devuelve el secreto HMAC REAL
   * (generado aquí, nunca tecleado) y las URLs a las que el plugin debe
   * apuntar de ahora en adelante.
   */
  async register(input: EcommerceRegisterInput) {
    const prefix = input.connectionKey.slice(0, CONNECTION_KEY_PREFIX.length + 6);
    const conn = await this.prisma.bypass((tx) =>
      tx.ecommerceConnection.findUnique({ where: { connectionKeyPrefix: prefix } }),
    );
    if (
      !conn ||
      !conn.connectionKeyHash ||
      !conn.connectionKeyExpiresAt ||
      conn.connectionKeyExpiresAt.getTime() < Date.now() ||
      !safeHashEquals(hashApiKey(input.connectionKey), conn.connectionKeyHash)
    ) {
      throw new UnauthorizedError('Clave de conexión inválida o caducada');
    }

    const hmacSecret = randomBytes(32).toString('base64url');
    await this.prisma.bypass(async (tx) => {
      await tx.ingestSource.update({ where: { id: conn.ingestSourceId }, data: { active: true, secret: hmacSecret } });
      await tx.ecommerceConnection.update({
        where: { id: conn.id },
        data: {
          status: 'CONNECTED',
          storeName: input.storeName,
          storeUrl: input.storeUrl,
          pluginVersion: input.pluginVersion,
          connectedAt: new Date(),
          // La clave de conexión es de UN SOLO USO: se consume aquí.
          connectionKeyPrefix: null,
          connectionKeyHash: null,
          connectionKeyExpiresAt: null,
        },
      });
    });
    this.logger.log({ tenantId: conn.tenantId }, 'tienda WooCommerce conectada');

    const urls = webhookUrls(conn.ingestSourceId);
    return { secret: hmacSecret, eventsWebhookUrl: urls.events, catalogWebhookUrl: urls.catalog };
  }
}
