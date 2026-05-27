import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

// Kit Digital evidence: access log is now ADMIN-ONLY.
// Tenants can't see logs themselves — super admin pulls evidence on their behalf.
@ApiTags('admin/access-logs')
@UseGuards(AdminAuthGuard)
@Controller('admin/access-logs')
export class AccessLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @Query('tenantId') tenantId?: string,
    @Query('email') email?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prisma.bypass((tx) =>
      tx.accessLog.findMany({
        where: {
          tenantId: tenantId || undefined,
          email: email ? { contains: email, mode: 'insensitive' } : undefined,
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit ? Math.min(Number(limit), 1000) : 200,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
      }),
    );
  }

  @Get('export.csv')
  async exportCsv(
    @Res({ passthrough: true }) res: FastifyReply,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<string> {
    const logs = await this.prisma.bypass((tx) =>
      tx.accessLog.findMany({
        where: {
          tenantId: tenantId || undefined,
          createdAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: { createdAt: 'asc' },
        include: { tenant: { select: { slug: true } } },
      }),
    );

    const header = [
      'created_at',
      'tenant_slug',
      'email',
      'user_id',
      'action',
      'success',
      'ip',
      'user_agent',
    ].join(',');
    const rows = logs.map((l) =>
      [
        l.createdAt.toISOString(),
        l.tenant?.slug ?? '',
        csvEscape(l.email),
        l.userId ?? '',
        l.action,
        l.success,
        l.ip ?? '',
        csvEscape(l.userAgent ?? ''),
      ].join(','),
    );

    const fileScope = tenantId ? `tenant-${tenantId}` : 'all-tenants';
    res.header('content-type', 'text/csv; charset=utf-8');
    res.header(
      'content-disposition',
      `attachment; filename="access-logs-${fileScope}-${new Date().toISOString().slice(0, 10)}.csv"`,
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
