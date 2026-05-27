import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

// Kit Digital evidence: per-user access log, exportable as CSV.
@ApiTags('access-logs')
@UseGuards(TenantAuthGuard)
@Controller('access-logs')
export class AccessLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.accessLog.findMany({
        where: {
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit ? Math.min(Number(limit), 1000) : 200,
      }),
    );
  }

  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: FastifyReply,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<string> {
    const logs = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.accessLog.findMany({
        where: {
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );

    const header = ['created_at', 'email', 'user_id', 'action', 'success', 'ip', 'user_agent'].join(
      ',',
    );
    const rows = logs.map((l) =>
      [
        l.createdAt.toISOString(),
        csvEscape(l.email),
        l.userId ?? '',
        l.action,
        l.success,
        l.ip ?? '',
        csvEscape(l.userAgent ?? ''),
      ].join(','),
    );

    res.header('content-type', 'text/csv; charset=utf-8');
    res.header(
      'content-disposition',
      `attachment; filename="access-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return [header, ...rows].join('\n');
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
