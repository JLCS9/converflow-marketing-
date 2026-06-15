import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CampaignsService } from './campaigns.service.js';

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Public open-tracking pixel for campaign emails. Hit by the recipient's mail
 * client; the signed token maps to a CampaignRecipient. Always returns the
 * pixel (never errors) so broken/asset-blocked clients don't show a broken img.
 */
@ApiTags('public')
@Controller('c')
export class CampaignTrackController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get('o/:token')
  async open(@Param('token') token: string, @Res() res: FastifyReply): Promise<void> {
    await this.campaigns.trackOpen(token).catch(() => undefined);
    res
      .header('Content-Type', 'image/gif')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      .header('Pragma', 'no-cache')
      .send(PIXEL);
  }
}
