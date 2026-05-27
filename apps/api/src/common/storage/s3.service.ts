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
 * Provider-agnostic S3 wrapper. Works against any S3-compatible store:
 *   - Cloudflare R2 (S3_ENDPOINT=https://<accountId>.r2.cloudflarestorage.com,
 *     S3_REGION=auto)
 *   - AWS S3 (S3_ENDPOINT omitted, S3_REGION=eu-west-1, etc.)
 *   - Backblaze B2, MinIO, Wasabi… (same shape, different endpoint).
 *
 * Object keys: `tenant/<tenantId>/document/<docId>/<filename>` (sanitized).
 * Downloads via short-lived presigned URLs (default 10 min) so objects stay
 * private even on public buckets.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client | null = null;

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new AppError(
        'INTERNAL',
        'S3 no está configurado. Añade S3_* en .env.prod y reinicia el contenedor.',
        503,
      );
    }
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      // R2 requires path-style; harmless on real AWS.
      forcePathStyle: !!env.S3_ENDPOINT && !env.S3_ENDPOINT.includes('amazonaws.com'),
    });
    return this.client;
  }

  private get bucket(): string {
    if (!env.S3_BUCKET) throw new AppError('INTERNAL', 'S3_BUCKET sin configurar', 503);
    return env.S3_BUCKET;
  }

  buildKey(tenantId: string, documentId: string, filename: string): string {
    // Strip path separators and collapse whitespace; cap at 120 chars
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
      this.logger.warn({ key, err }, 's3 delete failed (continuing)');
    }
  }
}
