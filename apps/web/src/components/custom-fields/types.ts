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

/**
 * Claves del diccionario (namespace `uiBits`) para cada tipo de campo.
 * Se traducen en render: este módulo no puede usar hooks.
 */
export const FIELD_TYPE_LABEL_KEY: Record<CustomFieldType, string> = {
  TEXT: 'fieldTypeText',
  LONGTEXT: 'fieldTypeLongtext',
  NUMBER: 'fieldTypeNumber',
  DATE: 'fieldTypeDate',
  BOOLEAN: 'fieldTypeBoolean',
  SELECT: 'fieldTypeSelect',
  MULTISELECT: 'fieldTypeMultiselect',
  URL: 'fieldTypeUrl',
  EMAIL: 'fieldTypeEmail',
  PHONE: 'fieldTypePhone',
  DOCUMENT: 'fieldTypeDocument',
};

/** Claves del diccionario (namespace `uiBits`) para cada entidad. */
export const ENTITY_LABEL_KEY: Record<CustomFieldEntity, string> = {
  LEAD: 'entityLeadClient',
  CLIENT: 'entityLeadClient',
  OPPORTUNITY: 'entityOpportunity',
};
