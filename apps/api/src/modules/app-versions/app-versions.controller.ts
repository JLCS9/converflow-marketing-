import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service.js';

// Public endpoint — no auth. Serves the changelog at /changelog.
@ApiTags('app-versions')
@Controller('app-versions')
export class AppVersionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.bypass((tx) =>
      tx.appVersion.findMany({
        orderBy: { releasedAt: 'desc' },
        select: {
          id: true,
          version: true,
          releasedAt: true,
          title: true,
          description: true,
          highlights: true,
        },
      }),
    );
  }
}
