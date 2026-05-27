import { Injectable } from '@nestjs/common';
import { BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { R2Service } from '../../common/storage/r2.service.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  list(tenantId: string, opts: { clientId?: string; opportunityId?: string } = {}) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.document.findMany({
        where: {
          clientId: opts.clientId || undefined,
          opportunityId: opts.opportunityId || undefined,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, name: true } },
          opportunity: { select: { id: true, name: true } },
        },
        take: 200,
      }),
    );
  }

  async create(
    tenantId: string,
    userId: string,
    file: {
      buffer: Buffer;
      filename: string;
      mimeType: string;
      sizeBytes: number;
    },
    refs: { clientId?: string; opportunityId?: string },
  ) {
    if (file.sizeBytes > MAX_FILE_BYTES) {
      throw new BadRequestError(`Fichero demasiado grande (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
    }
    if (file.sizeBytes === 0) {
      throw new BadRequestError('Fichero vacío');
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      // First create the DB row so we get an id, then upload to R2 using that id
      // in the key (so renames are isolated).
      const doc = await tx.document.create({
        data: {
          tenantId,
          clientId: refs.clientId,
          opportunityId: refs.opportunityId,
          name: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageKey: 'pending',
          uploadedBy: userId,
        },
      });

      const key = this.r2.buildKey(tenantId, doc.id, file.filename);
      try {
        await this.r2.upload({
          key,
          body: file.buffer,
          mimeType: file.mimeType,
          metadata: { tenantId, documentId: doc.id, uploadedBy: userId },
        });
      } catch (err) {
        await tx.document.delete({ where: { id: doc.id } });
        throw err;
      }

      return tx.document.update({ where: { id: doc.id }, data: { storageKey: key } });
    });
  }

  async downloadUrl(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const doc = await tx.document.findUnique({ where: { id } });
      if (!doc) throw new NotFoundError('Documento no encontrado');
      const url = await this.r2.signedDownloadUrl(doc.storageKey, 600);
      return { url, name: doc.name, mimeType: doc.mimeType };
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const doc = await tx.document.findUnique({ where: { id } });
      if (!doc) throw new NotFoundError('Documento no encontrado');
      await this.r2.delete(doc.storageKey);
      await tx.document.delete({ where: { id } });
    });
  }
}
