import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { LifecycleService } from '../lifecycle/lifecycle.service.js';
import { VERTICAL_TEMPLATES } from './templates.js';

/**
 * Siembra de plantillas de vertical (F1). Idempotente y NO destructiva: los
 * campos se upsertan por key (lo que el tenant haya personalizado encima no
 * se pisa: solo se crean los que falten) y la definición de ciclo de vida se
 * upserta por nombre.
 */
@Injectable()
export class VerticalsService {
  private readonly logger = new Logger(VerticalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: LifecycleService,
  ) {}

  list() {
    return Object.values(VERTICAL_TEMPLATES).map((t) => ({
      key: t.key,
      name: t.name,
      version: t.version,
      fields: t.profileFields.length,
      states: t.lifecycle.definition.states.length,
    }));
  }

  async apply(tenantId: string, templateKey: string) {
    const tpl = VERTICAL_TEMPLATES[templateKey];
    if (!tpl) throw new NotFoundError('Plantilla de vertical desconocida');

    let fieldsCreated = 0;
    await this.prisma.withTenant(tenantId, async (tx) => {
      for (const [i, f] of tpl.profileFields.entries()) {
        const existing = await tx.customFieldDefinition.findUnique({
          where: { tenantId_entityType_key: { tenantId, entityType: 'PROFILE', key: f.key } },
          select: { id: true },
        });
        if (existing) continue; // lo personalizado por el tenant no se pisa
        await tx.customFieldDefinition.create({
          data: {
            tenantId,
            entityType: 'PROFILE',
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required ?? false,
            options: (f.options as never) ?? undefined,
            helpText: f.helpText,
            order: i,
            sensitive: f.sensitive ?? false,
            retentionDays: f.retentionDays,
            extractable: f.extractable ?? false,
          },
        });
        fieldsCreated++;
      }
    });

    await this.lifecycle.upsertDefinition(
      tenantId,
      tpl.lifecycle.name,
      tpl.lifecycle.definition,
      tpl.key,
    );

    this.logger.log(`plantilla ${tpl.key} v${tpl.version} aplicada a ${tenantId} (${fieldsCreated} campos nuevos)`);
    return { template: tpl.key, version: tpl.version, fieldsCreated, lifecycle: tpl.lifecycle.name };
  }
}
