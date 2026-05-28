import { prisma, withTenant, withRlsBypass } from '@converflow/db';
import type { BotStatus } from '@converflow/db';

export async function setBotStatus(
  tenantId: string,
  botId: string,
  status: BotStatus,
  opts?: { connected?: boolean; disconnectReason?: string; phoneNumber?: string },
): Promise<void> {
  await withTenant(prisma, tenantId, (tx) =>
    tx.bot.update({
      where: { id: botId },
      data: {
        status,
        ...(opts?.connected ? { lastConnectedAt: new Date() } : {}),
        ...(opts?.phoneNumber ? { phoneNumber: opts.phoneNumber } : {}),
        ...(opts?.disconnectReason !== undefined
          ? { lastDisconnectAt: new Date(), lastDisconnectReason: opts.disconnectReason }
          : {}),
      },
    }),
  );
}

/** Bots that were CONNECTED before the runner restarted — reconnect on boot. */
export async function listReconnectableBots(): Promise<{ id: string; tenantId: string }[]> {
  return withRlsBypass(prisma, (tx) =>
    tx.bot.findMany({
      where: { status: 'CONNECTED', channel: 'WHATSAPP' },
      select: { id: true, tenantId: true },
    }),
  );
}
