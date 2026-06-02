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
import { DocumentsModule } from './modules/documents/documents.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { MeetingsModule } from './modules/meetings/meetings.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { WebchatModule } from './modules/webchat/webchat.module.js';
import { InternalModule } from './modules/internal/internal.module.js';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module.js';
import { PipelinesModule } from './modules/pipelines/pipelines.module.js';
import { LeadScoringModule } from './modules/lead-scoring/lead-scoring.module.js';
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js';
import { AiModule } from './common/ai/ai.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { GuardsModule } from './common/guards/guards.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    GuardsModule,
    AiModule,
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
    DocumentsModule,
    NotesModule,
    ReportsModule,
    AlertsModule,
    IntegrationsModule,
    MeetingsModule,
    ConversationsModule,
    AgentsModule,
    WebchatModule,
    InternalModule,
    CustomFieldsModule,
    PipelinesModule,
    LeadScoringModule,
    ApiKeysModule,
  ],
})
export class AppModule {}
