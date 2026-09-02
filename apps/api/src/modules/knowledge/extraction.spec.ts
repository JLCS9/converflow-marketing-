import { describe, expect, it } from 'vitest';
import { buildExtractionSchema, sanitizeExtraction } from './extraction.js';
import { VERTICAL_TEMPLATES } from '../verticals/templates.js';

const DEFS = [
  { key: 'curso_objetivo', label: 'Curso de interés', type: 'TEXT' },
  { key: 'bonificable', label: 'Interesa FUNDAE', type: 'BOOLEAN' },
  {
    key: 'rol_compra',
    label: 'Rol de compra',
    type: 'SELECT',
    options: [{ value: 'alumno', label: 'Alumno' }, { value: 'empresa', label: 'Empresa' }],
  },
  {
    key: 'intereses',
    label: 'Intereses',
    type: 'MULTISELECT',
    options: [{ value: 'liderazgo', label: 'Liderazgo' }, { value: 'ventas', label: 'Ventas' }],
  },
];

describe('extracción generada desde definiciones', () => {
  it('el JSON Schema refleja tipos, enums y nada obligatorio', () => {
    const schema = buildExtractionSchema(DEFS) as never as {
      properties: Record<string, { type: string; enum?: string[] }>;
      required: string[];
    };
    expect(schema.properties.curso_objetivo!.type).toBe('string');
    expect(schema.properties.bonificable!.type).toBe('boolean');
    expect(schema.properties.rol_compra!.enum).toEqual(['alumno', 'empresa']);
    expect(schema.required).toEqual([]);
  });

  it('añadir un campo a las definiciones cambia el esquema sin tocar código', () => {
    const extended = [...DEFS, { key: 'presupuesto', label: 'Presupuesto', type: 'NUMBER' }];
    const schema = buildExtractionSchema(extended) as never as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.presupuesto).toMatchObject({ type: 'number' });
  });

  it('sanitize descarta claves desconocidas, enums inválidos y vacíos', () => {
    const out = sanitizeExtraction(DEFS as never, {
      curso_objetivo: 'Liderazgo I',
      rol_compra: 'marciano',
      intereses: ['liderazgo', 'yoga'],
      inventada: 'x',
      bonificable: '',
    });
    expect(out).toEqual({ curso_objetivo: 'Liderazgo I', intereses: ['liderazgo'] });
  });

  it('las plantillas de vertical generan esquemas válidos de serie', () => {
    for (const tpl of Object.values(VERTICAL_TEMPLATES)) {
      const extractable = tpl.profileFields.filter((f) => f.extractable);
      const schema = buildExtractionSchema(extractable as never) as never as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(schema.properties).length).toBe(extractable.length);
    }
  });
});
