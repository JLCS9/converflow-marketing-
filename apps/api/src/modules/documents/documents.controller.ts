import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { BadRequestError } from '@converflow/shared';
import { TenantOrApiKeyGuard } from '../../common/guards/tenant-or-api-key.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePerm } from '../../common/decorators/require-perm.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { DocumentsService } from './documents.service.js';

/**
 * File upload via multipart/form-data. The fastify multipart plugin is
 * registered in main.ts so we can call req.file() to pull the stream.
 */
type MultipartFile = {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
  fields?: Record<string, { value: string }>;
};

@ApiTags('documents')
@UseGuards(TenantOrApiKeyGuard, PermissionsGuard)
@RequirePerm('documents')
@Controller(['documents', 'v1/documents'])
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId?: string,
    @Query('opportunityId') opportunityId?: string,
  ) {
    return this.docs.list(user.tenantId, { clientId, opportunityId });
  }

  @Post('upload')
  async upload(@Req() req: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    // @ts-expect-error fastify multipart adds .file() to the request when registered
    const file: MultipartFile | undefined = await req.file();
    if (!file) throw new BadRequestError('No se ha enviado fichero');

    const buffer = await file.toBuffer();
    const sizeBytes = buffer.byteLength;

    const fields = file.fields ?? {};
    const clientId = fields.clientId?.value;
    const opportunityId = fields.opportunityId?.value;

    return this.docs.create(
      user.tenantId,
      user.userId,
      {
        buffer,
        filename: file.filename,
        mimeType: file.mimetype,
        sizeBytes,
      },
      { clientId, opportunityId },
    );
  }

  @Get(':id/download')
  download(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.docs.downloadUrl(user.tenantId, id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.docs.remove(user.tenantId, id);
    return { ok: true };
  }
}
