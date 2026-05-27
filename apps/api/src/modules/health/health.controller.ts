import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health(): Promise<{ status: 'ok'; version: string; checks: Record<string, 'ok' | 'fail'> }> {
    const checks: Record<string, 'ok' | 'fail'> = { db: 'ok' };

    try {
      await this.prisma.raw.$queryRaw`SELECT 1`;
    } catch {
      checks.db = 'fail';
    }

    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
    };
  }
}
