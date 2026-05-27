import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthAdminModule } from './modules/auth-admin/auth-admin.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { BotsModule } from './modules/bots/bots.module.js';
import { AccessLogsModule } from './modules/access-logs/access-logs.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    AuthAdminModule,
    TenantsModule,
    BotsModule,
    AccessLogsModule,
  ],
})
export class AppModule {}
