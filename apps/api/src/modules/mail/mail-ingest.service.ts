import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { sanitizeEmailHtml } from '../../common/utils/email-html.js';
import type { ParsedEmail } from './drivers/index.js';
import { MailAttachmentsService } from './mail-attachments.service.js';
import { MailContactsService } from './mail-contacts.service.js';
import { MailSharedService } from './mail-shared.service.js';
import { MailAutoReplyService } from './mail-auto-reply.service.js';
import { RoutingService } from '../routing/routing.service.js';
import { guessLanguage } from './mail-ai.service.js';

import { normalizeSubject, looksLikeReply } from './mail-subject.js';
// Reexport para compatibilidad (specs y consumidores existentes).
export { normalizeSubject, looksLikeReply };

/** Lowercased address set of everyone a message involved (from + to + cc). */
function addressesOf(m: {
  fromAddress?: string | null;
  toAddresses?: unknown;
  ccAddresses?: unknown;
}): string[] {
  const out: string[] = [];
  if (m.fromAddress) out.push(m.fromAddress);
  for (const field of [m.toAddresses, m.ccAddresses]) {
    if (Array.isArray(field)) {
      for (const a of field) if (typeof a === 'string') out.push(a);
    }
  }
  return out.map((a) => a.trim().toLowerCase()).filter(Boolean);
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
  private readonly logger = new Logger(MailIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: MailAttachmentsService,
    private readonly contacts: MailContactsService,
    private readonly routing: RoutingService,
    private readonly shared: MailSharedService,
    private readonly autoReply: MailAutoReplyService,
  ) {}

  async ingest(tenantId: string, connectionId: string, email: ParsedEmail) {
    const result = await this.prisma.withTenant(tenantId, async (tx) => {
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
      if (!threadId) {
        threadId = await this.resolveThreadBySubject(tx, connectionId, subject, email);
      }

      const when = email.date ?? new Date();
      // Participants = remitente + to + cc. Antes solo el remitente, y como
      // «Responder a todos» leía de aquí, los CC de los hilos entrantes se
      // perdían. También alimenta la búsqueda y el guard anti-fusión.
      const participantSeen = new Set<string>();
      const participant: string[] = [];
      for (const a of [email.fromAddress, ...(email.to ?? []), ...(email.cc ?? [])]) {
        const k = (a ?? '').trim().toLowerCase();
        if (!k || participantSeen.has(k)) continue;
        participantSeen.add(k);
        participant.push((a as string).trim());
      }

      let threadCreated = false;
      if (!threadId) {
        threadCreated = true;
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
          replyTo: email.replyTo,
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
          // Guessed once here, never on read: the inbox re-fetches the open
          // thread every 12s, so detecting lazily would mean a write per tick.
          // Heuristic only — no model call, so ingest stays free.
          detectedLang: guessLanguage(email.text ?? email.snippet ?? ''),
          receivedAt: when,
        },
        select: { id: true },
      });

      // 3) Bump the thread; a new inbound un-trashes/keeps it in INBOX.
      // Merge de participants: alguien añadido en CC a mitad de hilo tiene que
      // aparecer para que «Responder a todos» lo incluya.
      const th = await tx.emailThread.findUnique({
        where: { id: threadId },
        select: { participants: true },
      });
      const merged: string[] = [];
      const mergedSeen = new Set<string>();
      const prior = Array.isArray(th?.participants) ? (th.participants as string[]) : [];
      for (const a of [...prior, ...participant]) {
        const k = (a ?? '').trim().toLowerCase();
        if (!k || mergedSeen.has(k)) continue;
        mergedSeen.add(k);
        merged.push(a.trim());
      }
      await tx.emailThread.update({
        where: { id: threadId },
        data: {
          lastMessageAt: when,
          snippet: email.snippet ?? undefined,
          unreadCount: { increment: 1 },
          folder: 'INBOX',
          participants: merged,
          // Ticket: un entrante SIEMPRE (re)abre el hilo — también los CLOSED
          // (el cliente respondió a un ticket resuelto) y los PENDING.
          status: 'OPEN',
        },
      });

      return { created: true, threadId, messageId: message.id, threadCreated };
    });

    // Store attachments outside the DB call (S3 uploads), only for new messages.
    if (result.created && email.attachments?.length) {
      try {
        await this.attachments.storeInbound(tenantId, result.messageId, email.attachments);
      } catch {
        /* attachments are best-effort; the message is already saved */
      }
    }

    // Shared inbox → auto-save the sender as a lead if it doesn't exist yet.
    if (result.created && email.fromAddress) {
      try {
        const conn = await this.prisma.withTenant(tenantId, (tx) =>
          tx.mailConnection.findUnique({ where: { id: connectionId }, select: { visibility: true } }),
        );
        if (conn?.visibility === 'SHARED') {
          await this.contacts.ensureLead(tenantId, {
            email: email.fromAddress,
            name: email.fromName,
            source: 'Correo entrante',
          });
        }
      } catch {
        /* best-effort; never block ingestion */
      }
    }

    // Atención autónoma · hooks post-transacción. El ORDEN importa: primero
    // el enrutado (la auto-respuesta lee la asignación para su guard humano).
    // Best-effort: un fallo aquí JAMÁS rompe la ingesta.
    if (result.created && result.threadId) {
      if (result.threadCreated) {
        try {
          const assignee = await this.routing.match(tenantId, {
            channel: 'EMAIL',
            endpointId: connectionId,
            subject: email.subject ?? null,
            text: (email.text ?? email.snippet ?? '').slice(0, 4000),
            fromAddress: email.fromAddress ?? null,
          });
          if (assignee) {
            await this.shared.assignSystem(tenantId, result.threadId, assignee);
            this.logger.log({ threadId: result.threadId, assignee }, 'hilo enrutado por regla');
          }
        } catch (err) {
          this.logger.warn({ err }, 'enrutado de correo no aplicado');
        }
      }
      await this.autoReply.maybeRespond(tenantId, {
        connectionId,
        threadId: result.threadId,
        messageId: result.messageId!,
        email,
      });
    }
    return result;
  }

  /**
   * Last-resort threading by normalized subject, for clients that reply without
   * In-Reply-To/References headers.
   *
   * This used to match ANY thread with the same subject on the connection within
   * 30 days, which merged unrelated correspondence: two different customers both
   * writing "Presupuesto" landed in one thread. That is not a display glitch —
   * `MailComposeService.reply` defaults the recipient to the last inbound sender,
   * so replying could send one customer's content to another, and anyone opening
   * the thread saw both.
   *
   * Two guards now, and BOTH must hold:
   *
   *  1. The message must look like a reply (Re:/RV:/Fwd:). A bare subject starts
   *     a new conversation — subject threading exists to rescue replies whose
   *     headers were stripped, and those always carry a prefix.
   *  2. The sender must already be involved in the candidate thread, as From, To
   *     or Cc of one of its messages (or listed in its participants). This is
   *     what kills the generic-subject collision.
   *
   * When in doubt we open a NEW thread: splitting a conversation is a nuisance,
   * merging two is a data leak.
   */
  private async resolveThreadBySubject(
    tx: Parameters<Parameters<PrismaService['withTenant']>[1]>[0],
    connectionId: string,
    subject: string,
    email: ParsedEmail,
  ): Promise<string | null> {
    const sender = (email.fromAddress ?? '').trim().toLowerCase();
    if (!subject || !sender || !looksLikeReply(email.subject)) return null;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await tx.emailThread.findMany({
      where: { connectionId, subject, lastMessageAt: { gte: since } },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: { id: true, participants: true },
    });
    if (!candidates.length) return null;

    const messages = await tx.emailMessage.findMany({
      where: { threadId: { in: candidates.map((c) => c.id) } },
      select: { threadId: true, fromAddress: true, toAddresses: true, ccAddresses: true },
    });

    // Newest candidate first — `candidates` is already ordered.
    for (const c of candidates) {
      const known = new Set<string>();
      if (Array.isArray(c.participants)) {
        for (const a of c.participants) {
          if (typeof a === 'string') known.add(a.trim().toLowerCase());
        }
      }
      for (const m of messages) {
        if (m.threadId !== c.id) continue;
        for (const a of addressesOf(m)) known.add(a);
      }
      if (known.has(sender)) return c.id;
    }
    return null;
  }
}
