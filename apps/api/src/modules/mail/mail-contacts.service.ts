import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export interface ResolvedContact {
  type: 'lead' | 'client';
  id: string;
  name: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Don't auto-create leads from automated/system senders.
const AUTOMATED_RE = /(^|[._-])(no-?reply|noreply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce|automated|mailer|newsletter)([._-]|@)/i;

function isAutomated(email: string): boolean {
  return AUTOMATED_RE.test(email);
}

/** Resolve / create CRM contacts (lead or client) from an email address, for the mail module. */
@Injectable()
export class MailContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find an existing lead or client by email (case-insensitive). */
  async findByEmail(tenantId: string, emailRaw: string | null | undefined): Promise<ResolvedContact | null> {
    const email = (emailRaw ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return null;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (lead) return { type: 'lead' as const, id: lead.id, name: lead.name };
      const client = await tx.client.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (client) return { type: 'client' as const, id: client.id, name: client.name };
      return null;
    });
  }

  /**
   * Ensure a lead exists for this email. Returns the existing lead/client if any,
   * otherwise creates a new lead. Skips obviously automated senders.
   */
  async ensureLead(
    tenantId: string,
    input: { email: string | null | undefined; name?: string | null; source?: string },
  ): Promise<ResolvedContact | null> {
    const email = (input.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || isAutomated(email)) return null;
    const existing = await this.findByEmail(tenantId, email);
    if (existing) return existing;
    const name = (input.name ?? '').trim() || email.split('@')[0]!;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.create({
        data: { tenantId, name, email, source: input.source ?? 'Correo entrante', status: 'LEAD' },
        select: { id: true, name: true },
      });
      return { type: 'lead' as const, id: lead.id, name: lead.name };
    });
  }
}
