import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  NotFoundError,
  createCustomFieldSchema,
  customFieldDocumentValueSchema,
  reorderCustomFieldsSchema,
  updateCustomFieldSchema,
  type CreateCustomFieldInput,
  type CustomFieldEntity,
  type CustomFieldOption,
  type CustomFieldType,
  type ReorderCustomFieldsInput,
  type UpdateCustomFieldInput,
} from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

interface DefinitionLike {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: unknown;
}

function slugify(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || `field_${Date.now().toString(36)}`;
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, entityType?: CustomFieldEntity, includeArchived = false) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customFieldDefinition.findMany({
        where: {
          entityType: entityType ?? undefined,
          archivedAt: includeArchived ? undefined : null,
        },
        orderBy: [{ entityType: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  }

  async create(tenantId: string, input: CreateCustomFieldInput) {
    const data = createCustomFieldSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      let key = data.key ?? slugify(data.label);
      const existing = await tx.customFieldDefinition.findUnique({
        where: { tenantId_entityType_key: { tenantId, entityType: data.entityType, key } },
      });
      if (existing) {
        // disambiguate with a numeric suffix
        const base = key.slice(0, 36);
        let n = 2;
        while (
          await tx.customFieldDefinition.findUnique({
            where: {
              tenantId_entityType_key: { tenantId, entityType: data.entityType, key: `${base}_${n}` },
            },
          })
        ) {
          n += 1;
        }
        key = `${base}_${n}`;
      }
      const last = await tx.customFieldDefinition.findFirst({
        where: { tenantId, entityType: data.entityType, archivedAt: null },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const order = data.order ?? (last ? last.order + 1 : 0);
      return tx.customFieldDefinition.create({
        data: {
          tenantId,
          entityType: data.entityType,
          key,
          label: data.label,
          type: data.type,
          required: data.required ?? false,
          options: (data.options as never) ?? undefined,
          helpText: data.helpText,
          order,
        },
      });
    });
  }

  async update(tenantId: string, id: string, input: UpdateCustomFieldInput) {
    const data = updateCustomFieldSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const def = await tx.customFieldDefinition.findUnique({ where: { id } });
      if (!def) throw new NotFoundError('Campo no encontrado');
      return tx.customFieldDefinition.update({
        where: { id },
        data: {
          label: data.label,
          required: data.required,
          options: data.options !== undefined ? (data.options as never) : undefined,
          helpText: data.helpText,
          order: data.order,
          archivedAt:
            data.archived === undefined ? undefined : data.archived ? new Date() : null,
        },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const def = await tx.customFieldDefinition.findUnique({ where: { id } });
      if (!def) throw new NotFoundError('Campo no encontrado');
      // Soft-archive to keep existing values intact in Json columns.
      await tx.customFieldDefinition.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    });
  }

  async reorder(tenantId: string, input: ReorderCustomFieldsInput) {
    const data = reorderCustomFieldsSchema.parse(input);
    return this.prisma.withTenant(tenantId, async (tx) => {
      for (let i = 0; i < data.ids.length; i += 1) {
        await tx.customFieldDefinition.updateMany({
          where: { id: data.ids[i], entityType: data.entityType },
          data: { order: i },
        });
      }
    });
  }

  /**
   * Validates a raw customFields payload against the active definitions for
   * the given entityType. Returns a normalised object (unknown keys stripped,
   * values coerced to their declared type). Throws BadRequestError if a
   * required field is missing or a value doesn't match its declared type.
   */
  async validateValues(
    tenantId: string,
    entityType: CustomFieldEntity,
    raw: Record<string, unknown> | undefined,
    opts: { partial?: boolean } = {},
  ): Promise<Record<string, unknown> | undefined> {
    if (raw === undefined) return undefined;
    if (raw !== null && typeof raw !== 'object') {
      throw new BadRequestError('customFields debe ser un objeto');
    }
    const defs = await this.prisma.withTenant(tenantId, (tx) =>
      tx.customFieldDefinition.findMany({
        where: { entityType, archivedAt: null },
        select: { id: true, key: true, label: true, type: true, required: true, options: true },
      }),
    );
    const out: Record<string, unknown> = {};
    for (const def of defs as DefinitionLike[]) {
      const value = (raw as Record<string, unknown>)[def.key];
      const hasValue = value !== undefined && value !== null && value !== '';
      if (!hasValue) {
        if (def.required && !opts.partial) {
          throw new BadRequestError(`El campo "${def.label}" es obligatorio`);
        }
        continue;
      }
      out[def.key] = coerceValue(def, value);
    }
    return out;
  }
}

function coerceValue(def: DefinitionLike, value: unknown): unknown {
  switch (def.type) {
    case 'TEXT':
    case 'LONGTEXT':
    case 'URL':
    case 'EMAIL':
    case 'PHONE': {
      const s = String(value).trim();
      if (def.type === 'URL') {
        try {
          new URL(s);
        } catch {
          throw new BadRequestError(`"${def.label}" debe ser una URL válida`);
        }
      }
      if (def.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new BadRequestError(`"${def.label}" debe ser un email válido`);
      }
      const max = def.type === 'LONGTEXT' ? 5000 : 255;
      if (s.length > max) {
        throw new BadRequestError(`"${def.label}" excede el máximo (${max} caracteres)`);
      }
      return s;
    }
    case 'NUMBER': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) {
        throw new BadRequestError(`"${def.label}" debe ser numérico`);
      }
      return n;
    }
    case 'DATE': {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestError(`"${def.label}" debe ser una fecha válida`);
      }
      return d.toISOString();
    }
    case 'BOOLEAN': {
      if (typeof value === 'boolean') return value;
      const s = String(value).toLowerCase();
      if (['true', '1', 'yes', 'si', 'sí'].includes(s)) return true;
      if (['false', '0', 'no'].includes(s)) return false;
      throw new BadRequestError(`"${def.label}" debe ser sí/no`);
    }
    case 'SELECT': {
      const options = parseOptions(def.options);
      const valid = options.find((o) => o.value === String(value));
      if (!valid) {
        throw new BadRequestError(`"${def.label}" tiene un valor no permitido`);
      }
      return valid.value;
    }
    case 'MULTISELECT': {
      const options = parseOptions(def.options);
      const arr = Array.isArray(value) ? value : [value];
      const allowed = new Set(options.map((o) => o.value));
      const out: string[] = [];
      for (const v of arr) {
        const s = String(v);
        if (!allowed.has(s)) {
          throw new BadRequestError(`"${def.label}" contiene un valor no permitido`);
        }
        if (!out.includes(s)) out.push(s);
      }
      return out;
    }
    case 'DOCUMENT': {
      const parsed = customFieldDocumentValueSchema.safeParse(value);
      if (!parsed.success) {
        throw new BadRequestError(`"${def.label}" debe ser un documento válido`);
      }
      return parsed.data;
    }
  }
}

function parseOptions(raw: unknown): CustomFieldOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is CustomFieldOption =>
    typeof o === 'object' && o !== null && typeof (o as CustomFieldOption).value === 'string',
  );
}
