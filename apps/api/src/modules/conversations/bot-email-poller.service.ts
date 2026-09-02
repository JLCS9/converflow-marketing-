import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { isAutomatedSender } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { decryptSecret } from '../../common/utils/crypto.js';
import { ConversationIngestService } from './conversation-ingest.service.js';

const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS ?? 60_000);

interface Conn {
  botId: string;
  tenantId: string;
  email: string;
  imapHost: string;
  imapPort: number;
  username: string;
  passwordEnc: string;
  secure: boolean;
  lastSeenUid: number | null;
}

/** Clave para casar una conexión legacy contra los buzones del módulo Mail. */
export function mailboxKey(tenantId: string, email: string): string {
  return `${tenantId}:${email.trim().toLowerCase()}`;
}

/**
 * Decisión pura (testeable sin BD): solo «ya migrado al módulo Mail» detiene
 * el poll. El status NO se consulta a propósito: en este modelo legacy ERROR
 * significaba «falló alguna vez», no «buzón roto» — saltarlo apagó buzones
 * vivos en producción.
 */
export function pollVerdict(
  row: { tenantId: string; email: string },
  superseded: Set<string>,
): 'poll' | 'superseded' {
  return superseded.has(mailboxKey(row.tenantId, row.email)) ? 'superseded' : 'poll';
}

/**
 * E2 · Poller IMAP de buzones de BOT (EmailConnection), portado desde
 * apps/workers/email-poller: mismo cursor UID, mismos guardas anti-loop y
 * mismo skip de buzones ya migrados al módulo Mail — pero DENTRO del API
 * (sin salto HTTP interno) y llamando a ingestEmail directamente.
 * El proceso workers queda sin trabajo y se retira del compose.
 */
@Injectable()
export class BotEmailPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotEmailPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: ConversationIngestService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.logger.log(`bot email poller activo (cada ${POLL_INTERVAL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const conns = await this.loadPollable();
      for (const conn of conns) {
        try {
          await this.pollConnection(conn);
        } catch (err) {
          this.logger.warn({ err, email: conn.email }, 'email poll failed');
          await this.markError(conn.botId, err instanceof Error ? err.message : 'poll failed');
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async loadPollable(): Promise<Conn[]> {
    const rows = await this.prisma.bypass((tx) =>
      tx.emailConnection.findMany({
        select: {
          botId: true,
          tenantId: true,
          email: true,
          imapHost: true,
          imapPort: true,
          username: true,
          passwordEnc: true,
          secure: true,
          lastSeenUid: true,
        },
      }),
    );
    if (!rows.length) return [];

    // Buzón ya conectado en el módulo Mail → dos pollers sobre el mismo INBOX
    // ingerirían cada correo dos veces (Conversation + EmailThread).
    const migrated = await this.prisma.bypass((tx) =>
      tx.mailConnection.findMany({ select: { tenantId: true, fromAddress: true } }),
    );
    const superseded = new Set(migrated.map((m) => mailboxKey(m.tenantId, m.fromAddress)));

    return rows.filter((r) => {
      if (pollVerdict(r, superseded) === 'superseded') {
        this.logger.debug({ email: r.email }, 'buzón ya migrado al módulo Mail — skip');
        return false;
      }
      return true;
    }) as Conn[];
  }

  private async pollConnection(conn: Conn): Promise<void> {
    const client = new ImapFlow({
      host: conn.imapHost,
      port: conn.imapPort,
      secure: conn.secure,
      auth: { user: conn.username, pass: decryptSecret(conn.passwordEnc) },
      logger: false,
      emitLogs: false,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mailbox = client.mailbox;
        const uidNext = typeof mailbox === 'object' && mailbox ? (mailbox.uidNext ?? 1) : 1;

        // Primera sincronización: solo fijar el cursor, sin importar histórico.
        if (conn.lastSeenUid == null) {
          await this.setCursor(conn.botId, Math.max(0, uidNext - 1));
          return;
        }

        let maxUid = conn.lastSeenUid;
        for await (const msg of client.fetch(
          `${conn.lastSeenUid + 1}:*`,
          { uid: true, source: true },
          { uid: true },
        )) {
          const uid = msg.uid ?? 0;
          if (uid <= conn.lastSeenUid) continue;
          maxUid = Math.max(maxUid, uid);
          if (!msg.source) continue;
          try {
            const parsed = await simpleParser(msg.source);
            const sender = parsed.from?.value?.[0];
            const from = sender?.address ?? '';
            if (!from) continue;

            // Anti-loop: jamás ingerir bounces/auto-replies/sistema ni nuestra
            // propia dirección. Las cabeceras solo existen aquí (mailparser).
            const autoSubmitted = String(parsed.headers.get('auto-submitted') ?? '').toLowerCase();
            const precedence = String(parsed.headers.get('precedence') ?? '').toLowerCase();
            if (
              (autoSubmitted && autoSubmitted !== 'no') ||
              ['bulk', 'auto_reply', 'list', 'junk'].includes(precedence) ||
              isAutomatedSender(from) ||
              from.toLowerCase() === conn.email.toLowerCase()
            ) {
              this.logger.log({ from }, 'correo automatizado/bounce saltado (anti-loop)');
              continue;
            }

            await this.ingest.ingestEmail({
              to: conn.email,
              from,
              fromName: sender?.name || undefined,
              subject: parsed.subject ?? '',
              text: parsed.text ?? '',
              html: typeof parsed.html === 'string' ? parsed.html : undefined,
              messageId: parsed.messageId ?? undefined,
            });
          } catch (err) {
            this.logger.warn({ err, uid }, 'no se pudo parsear/ingerir el correo');
          }
        }

        if (maxUid > conn.lastSeenUid) await this.setCursor(conn.botId, maxUid);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  private async setCursor(botId: string, uid: number): Promise<void> {
    await this.prisma.bypass((tx) =>
      tx.emailConnection.update({
        where: { botId },
        // También limpia el error: antes nada lo reseteaba y un blip de red
        // dejaba status=ERROR para siempre en buzones que funcionaban.
        data: { lastSeenUid: uid, status: 'CONNECTED', lastError: null },
      }),
    );
  }

  private async markError(botId: string, message: string): Promise<void> {
    await this.prisma
      .bypass((tx) =>
        tx.emailConnection.update({
          where: { botId },
          data: { status: 'ERROR', lastError: message.slice(0, 300) },
        }),
      )
      .catch(() => undefined);
  }
}
