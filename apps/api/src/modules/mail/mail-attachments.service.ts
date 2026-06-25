import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { NotFoundError, BadRequestError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { S3Service } from '../../common/storage/s3.service.js';
import { MailConnectionsService } from './mail-connections.service.js';

interface Actor {
  userId: string;
  role: string;
}

/** A file already uploaded to R2 (staging), referenced by the composer before sending. */
export interface StagedAttachment {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

const MAX_INBOUND = 20;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

function safeName(f: string): string {
  return (f || 'adjunto').replace(/[/\\]/g, '_').replace(/\s+/g, '-').slice(0, 120);
}

@Injectable()
export class MailAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly connections: MailConnectionsService,
  ) {}

  /** Store an uploaded file in R2 (not yet linked to a message) and return its descriptor. */
  async uploadStaging(
    tenantId: string,
    file: { buffer: Buffer; filename: string; mimeType: string; sizeBytes: number },
  ): Promise<StagedAttachment> {
    if (!file.sizeBytes) throw new BadRequestError('Fichero vacío');
    if (file.sizeBytes > MAX_BYTES) throw new BadRequestError('El fichero supera 25 MB');
    const key = `tenant/${tenantId}/email/staging/${randomUUID()}/${safeName(file.filename)}`;
    await this.s3.upload({
      key,
      body: file.buffer,
      mimeType: file.mimeType || 'application/octet-stream',
      metadata: { tenantId },
    });
    return {
      storageKey: key,
      filename: file.filename,
      mimeType: file.mimeType || 'application/octet-stream',
      sizeBytes: file.sizeBytes,
    };
  }

  /** Presigned download URL for a stored attachment (asserts access via its connection). */
  async downloadUrl(tenantId: string, attachmentId: string, actor: Actor) {
    const att = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailAttachment.findUnique({
        where: { id: attachmentId },
        include: { message: { select: { connectionId: true } } },
      }),
    );
    if (!att) throw new NotFoundError('Adjunto no encontrado');
    await this.connections.assertAccess(tenantId, att.message.connectionId, actor);
    const url = await this.s3.signedDownloadUrl(att.storageKey, 600);
    return { url, filename: att.filename };
  }

  /** Persist inbound attachments (from the IMAP parser) to R2 + DB. Bounded by count/size. */
  async storeInbound(
    tenantId: string,
    messageId: string,
    items: { filename?: string; mimeType?: string; content?: Buffer; inline?: boolean; contentId?: string }[],
  ): Promise<void> {
    for (const it of items.slice(0, MAX_INBOUND)) {
      const content = it.content;
      if (!content?.length || content.length > MAX_BYTES) continue;
      const key = `tenant/${tenantId}/email/${messageId}/${safeName(it.filename ?? 'adjunto')}`;
      await this.s3.upload({
        key,
        body: content,
        mimeType: it.mimeType || 'application/octet-stream',
        metadata: { tenantId, messageId },
      });
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.emailAttachment.create({
          data: {
            tenantId,
            messageId,
            filename: it.filename ?? 'adjunto',
            mimeType: it.mimeType || 'application/octet-stream',
            sizeBytes: content.length,
            storageKey: key,
            inline: it.inline ?? false,
            contentId: it.contentId ?? null,
          },
        }),
      );
    }
  }

  /** Resolve staged attachments to nodemailer { filename, path } via presigned URLs. */
  async presignForSend(staged: StagedAttachment[] | undefined): Promise<{ filename: string; path: string }[]> {
    const out: { filename: string; path: string }[] = [];
    for (const s of staged ?? []) {
      const path = await this.s3.signedDownloadUrl(s.storageKey, 600);
      out.push({ filename: s.filename, path });
    }
    return out;
  }

  /** Presigned send descriptors for a message's already-stored attachments (used by sendDraft). */
  async presignForMessage(tenantId: string, messageId: string): Promise<{ filename: string; path: string }[]> {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.emailAttachment.findMany({ where: { messageId }, select: { filename: true, storageKey: true } }),
    );
    const out: { filename: string; path: string }[] = [];
    for (const r of rows) {
      out.push({ filename: r.filename, path: await this.s3.signedDownloadUrl(r.storageKey, 600) });
    }
    return out;
  }
}
