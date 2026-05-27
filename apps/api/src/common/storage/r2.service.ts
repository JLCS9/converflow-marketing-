import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';
import { AppError } from '@converflow/shared';

/**
 * Wrapper around the AWS S3 SDK pointed at Cloudflare R2.
 *
 * Object keys are namespaced by tenant: `tenant/<tenantId>/document/<docId>/<filename>`.
 * Downloads are served via short-lived presigned URLs (default 10 min) so the
 * docs stay private even though the bucket is on the public R2 endpoint.
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private client: S3Client | null = null;

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      throw new AppError(
        'INTERNAL',
        'R2 no está configurado. Añade R2_* en .env.prod y reinicia el contenedor.',
        503,
      );
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    return this.client;
  }

  private get bucket(): string {
    if (!env.R2_BUCKET) throw new AppError('INTERNAL', 'R2_BUCKET sin configurar', 503);
    return env.R2_BUCKET;
  }

  buildKey(tenantId: string, documentId: string, filename: string): string {
    // Strip path separators from filename
    const safe = filename.replace(/[/\\]/g, '_').replace(/\s+/g, '-').slice(0, 120);
    return `tenant/${tenantId}/document/${documentId}/${safe}`;
  }

  async upload(opts: {
    key: string;
    body: Buffer | Uint8Array;
    mimeType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: opts.key,
        Body: opts.body,
        ContentType: opts.mimeType,
        Metadata: opts.metadata,
      }),
    );
  }

  async signedDownloadUrl(key: string, expiresInSec = 600): Promise<string> {
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  async delete(key: string): Promise<void> {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      // Idempotent — log but don't throw if already gone
      this.logger.warn({ key, err }, 'r2 delete failed (continuing)');
    }
  }
}
