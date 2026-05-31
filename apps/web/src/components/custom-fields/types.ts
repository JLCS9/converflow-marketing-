export type CustomFieldType =
  | 'TEXT'
  | 'LONGTEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTISELECT'
  | 'URL'
  | 'EMAIL'
  | 'PHONE'
  | 'DOCUMENT';

export type CustomFieldEntity = 'LEAD' | 'CLIENT' | 'OPPORTUNITY';

export interface CustomFieldOption {
  value: string;
  label: string;
}

export interface CustomFieldDefinition {
  id: string;
  entityType: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: CustomFieldOption[] | null;
  helpText: string | null;
  order: number;
  archivedAt: string | null;
}

export interface CustomFieldDocumentValue {
  documentId: string;
  name: string;
  mime?: string;
  size?: number;
}

export const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  TEXT: 'Texto corto',
  LONGTEXT: 'Texto largo',
  NUMBER: 'Número',
  DATE: 'Fecha',
  BOOLEAN: 'Sí / No',
  SELECT: 'Lista (una opción)',
  MULTISELECT: 'Lista (múltiple)',
  URL: 'URL',
  EMAIL: 'Email',
  PHONE: 'Teléfono',
  DOCUMENT: 'Documento',
};

export const ENTITY_LABEL: Record<CustomFieldEntity, string> = {
  LEAD: 'Leads',
  CLIENT: 'Clientes',
  OPPORTUNITY: 'Oportunidades',
};
