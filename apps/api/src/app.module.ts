import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthAdminModule } from './modules/auth-admin/auth-admin.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { BotsModule } from './modules/bots/bots.module.js';
import { AdminBotsModule } from './modules/admin-bots/admin-bots.module.js';
import { AccessLogsModule } from './modules/access-logs/access-logs.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { MeModule } from './modules/me/me.module.js';
import { AppVersionsModule } from './modules/app-versions/app-versions.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
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
    AdminBotsModule,
    AccessLogsModule,
    UsersModule,
    MeModule,
    AppVersionsModule,
    LeadsModule,
    OpportunitiesModule,
    ClientsModule,
    TasksModule,
  ],
})
export class AppModule {}
