import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { sanitizeEmailHtml } from '../../common/utils/email-html.js';
import type { ParsedEmail } from './drivers/index.js';

export function normalizeSubject(subject?: string): string {
  return (subject ?? '').replace(/^((re|rv|fwd|fw)\s*:\s*)+/i, '').trim();
}

/** Split RFC reference ids into a clean list of Message-IDs. */
function refIds(email: ParsedEmail): string[] {
  const raw = `${email.inReplyTo ?? ''} ${email.references ?? ''}`;
  return raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Ingest one parsed inbound email into the inbox model. Idempotent by
 * rfcMessageId. Threads by RFC references first, then a normalized
 * subject within the same connection, else opens a new thread.
 */
@Injectable()
export class MailIngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(tenantId: string, connectionId: string, email: ParsedEmail) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1) Dedupe by Message-ID (per connection).
      if (email.rfcMessageId) {
        const dupe = await tx.emailMessage.findFirst({
          where: { connectionId, rfcMessageId: email.rfcMessageId },
          select: { id: true, threadId: true },
        });
        if (dupe) return { created: false, threadId: dupe.threadId, messageId: dupe.id };
      }

      // 2) Resolve the thread: references → subject → new.
      let threadId: string | null = null;
      const refs = refIds(email);
      if (refs.length) {
        const parent = await tx.emailMessage.findFirst({
          where: { connectionId, rfcMessageId: { in: refs } },
          select: { threadId: true },
        });
        if (parent) threadId = parent.threadId;
      }
      const subject = normalizeSubject(email.subject);
      if (!threadId && subject) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const t = await tx.emailThread.findFirst({
          where: { connectionId, subject, lastMessageAt: { gte: since } },
          orderBy: { lastMessageAt: 'desc' },
          select: { id: true },
        });
        if (t) threadId = t.id;
      }

      const when = email.date ?? new Date();
      const participant = email.fromAddress ? [email.fromAddress] : [];

      if (!threadId) {
        const thread = await tx.emailThread.create({
          data: {
            tenantId,
            connectionId,
            subject: subject || null,
            participants: participant,
            folder: 'INBOX',
            status: 'OPEN',
            snippet: email.snippet ?? null,
            lastMessageAt: when,
            unreadCount: 0,
          },
          select: { id: true },
        });
        threadId = thread.id;
      }

      const message = await tx.emailMessage.create({
        data: {
          tenantId,
          threadId,
          connectionId,
          rfcMessageId: email.rfcMessageId,
          inReplyTo: email.inReplyTo,
          references: email.references,
          direction: 'IN',
          folder: 'INBOX',
          fromAddress: email.fromAddress,
          fromName: email.fromName,
          toAddresses: email.to,
          ccAddresses: email.cc,
          subject: email.subject,
          // Inbound HTML is untrusted — sanitize before storing so it renders safely.
          html: email.html ? sanitizeEmailHtml(email.html) : null,
          text: email.text,
          snippet: email.snippet,
          receivedAt: when,
        },
        select: { id: true },
      });

      // 3) Bump the thread; a new inbound un-trashes/keeps it in INBOX.
      await tx.emailThread.update({
        where: { id: threadId },
        data: {
          lastMessageAt: when,
          snippet: email.snippet ?? undefined,
          unreadCount: { increment: 1 },
          folder: 'INBOX',
        },
      });

      return { created: true, threadId, messageId: message.id };
    });
  }
}
