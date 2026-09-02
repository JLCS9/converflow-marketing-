import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AiService } from '../../common/ai/ai.service.js';
import { htmlToText } from '../../common/utils/email-html.js';
import { corporateDomainOf } from './profiles.service.js';

export interface Enrichment {
  domain: string;
  sector: string | null;
  sizeHint: string | null;
  summary: string | null;
  services: string[];
  source: 'public_web';
}

/** No re-enriquecer un perfil ya enriquecido hace menos de 30 días. */
const FRESH_DAYS = 30;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 300_000;
const MAX_TEXT_CHARS = 6_000;

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    useful: {
      type: 'boolean',
      description:
        'false si la página no da información real de la empresa (parking de dominio, error, página vacía).',
    },
    sector: { type: 'string', description: 'Sector de actividad, en 2-5 palabras. Solo si aparece.' },
    size_hint: {
      type: 'string',
      description: 'Pista de tamaño SOLO si la página la da (nº empleados, sedes, "desde 1990"…).',
    },
    summary: { type: 'string', description: 'Qué hace la empresa, en 1-2 frases. Solo hechos de la página.' },
    services: {
      type: 'array',
      items: { type: 'string' },
      description: 'Hasta 5 productos/servicios que la página menciona.',
    },
  },
  required: ['useful'],
} as const;

/**
 * F3 · Enriquecimiento B2B fase 1: dominio corporativo → web pública →
 * perfil estructurado. Sin proveedores de pago: solo lo que la propia
 * empresa publica en su portada. El proveedor API (fase 2, F4) quedará
 * reservado a score alto y a un proveedor que asuma cumplimiento RGPD.
 */
@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async enrichProfile(
    tenantId: string,
    profileId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ enriched: boolean; reason?: string; enrichment?: Enrichment }> {
    const profile = await this.prisma.withTenant(tenantId, (tx) =>
      tx.profile.findUnique({
        where: { id: profileId },
        select: {
          id: true,
          enrichedAt: true,
          enrichment: true,
          identities: { where: { kind: 'EMAIL' }, select: { value: true }, take: 3 },
        },
      }),
    );
    if (!profile) throw new NotFoundError('Perfil no encontrado');

    const domain = profile.identities
      .map((i) => corporateDomainOf(i.value))
      .find((d): d is string => Boolean(d));
    if (!domain) return { enriched: false, reason: 'no_corporate_domain' };

    const fresh =
      !opts.force &&
      profile.enrichedAt != null &&
      Date.now() - profile.enrichedAt.getTime() < FRESH_DAYS * 86_400_000;
    if (fresh) {
      return { enriched: true, reason: 'cached', enrichment: profile.enrichment as unknown as Enrichment };
    }

    const pageText = await this.fetchPublicSite(domain);
    if (!pageText) return { enriched: false, reason: 'site_unreachable' };

    const call = await this.ai.callWithTool<{
      useful: boolean;
      sector?: string;
      size_hint?: string;
      summary?: string;
      services?: string[];
    }>({
      tenantId,
      model: this.ai.modelFor('extract'),
      system:
        'Extraes datos de empresa de su propia web pública. SOLO hechos que aparezcan en el texto: ' +
        'nada de suposiciones ni conocimiento externo. Si la página no informa, useful = false.',
      userPrompt: `Dominio: ${domain}\n\nTEXTO DE LA PORTADA:\n${pageText}`,
      toolName: 'extraer_empresa',
      toolDescription: 'Devuelve los datos estructurados de la empresa.',
      toolInputSchema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 500,
    });
    void this.ai.recordUsage({
      tenantId,
      feature: 'profile_enrichment',
      callResult: call,
      resourceType: 'profile',
      resourceId: profileId,
      metadata: { domain, useful: call.result.useful === true },
    });

    if (call.result.useful !== true) return { enriched: false, reason: 'page_not_useful' };

    const enrichment: Enrichment = {
      domain,
      sector: call.result.sector?.trim() || null,
      sizeHint: call.result.size_hint?.trim() || null,
      summary: call.result.summary?.trim() || null,
      services: Array.isArray(call.result.services) ? call.result.services.slice(0, 5) : [],
      source: 'public_web',
    };
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.profile.update({
        where: { id: profileId },
        data: { enrichment: enrichment as unknown as object, enrichedAt: new Date() },
      }),
    );
    return { enriched: true, enrichment };
  }

  /**
   * Portada pública del dominio, como texto plano. Guardarraíles anti-SSRF:
   * solo https, dominios con TLD real (nunca IPs, localhost ni .local) y
   * respuesta acotada en tiempo y tamaño.
   */
  private async fetchPublicSite(domain: string): Promise<string | null> {
    if (!/^[a-z0-9][a-z0-9.-]{2,250}\.[a-z]{2,}$/i.test(domain)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return null;
    if (/\.(local|internal|lan|localhost)$/i.test(domain) || domain === 'localhost') return null;

    for (const url of [`https://${domain}`, `https://www.${domain}`]) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'user-agent': 'ConverflowBot/1.0 (+https://converflow.ai)' },
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('text/html')) continue;
        const html = (await res.text()).slice(0, MAX_HTML_BYTES);
        const text = htmlToText(html).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
        if (text.length > 100) return text;
      } catch {
        // siguiente candidato
      }
    }
    return null;
  }
}
