import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@ApiTags('admin/bots')
@UseGuards(AdminAuthGuard)
@Controller('admin/bots')
export class AdminBotsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('status') status?: string, @Query('tenantId') tenantId?: string) {
    return this.prisma.bypass((tx) =>
      tx.bot.findMany({
        where: {
          status: status as never,
          tenantId: tenantId || undefined,
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }
}
