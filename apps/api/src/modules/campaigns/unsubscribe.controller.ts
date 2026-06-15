import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service.js';

/**
 * Public unsubscribe landing — reached from the footer link in campaign emails.
 * No auth: the signed token carries the tenant + address. Adds the address to
 * the tenant's suppression list so future campaigns skip it.
 */
@ApiTags('public')
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(@Query('token') token?: string): Promise<string> {
    if (!token) return page('Enlace inválido', 'Falta el token de baja.');
    try {
      const { address } = await this.campaigns.unsubscribeByToken(token);
      return page(
        'Baja confirmada',
        `Hemos dado de baja a <strong>${escapeHtml(address)}</strong>. No recibirás más comunicaciones.`,
      );
    } catch {
      return page('Enlace inválido', 'El enlace de baja no es válido o ha caducado.');
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#1a1a1a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:2rem 2.5rem;max-width:420px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:1.25rem;margin:0 0 .75rem}p{color:#555;line-height:1.5;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${body}</p></div></body></html>`;
}
