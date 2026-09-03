import { z } from 'zod';

/**
 * Integración e-commerce (WooCommerce hoy, Shopify reservado). Válida para
 * cualquier tienda/vertical: no asume "un producto = un curso" ni "una
 * compra = un comprador único" — un pedido puede traer varias líneas y un
 * comprador puede ser una empresa (campo `company`).
 */
export const ECOMMERCE_PROVIDERS = ['WOOCOMMERCE', 'SHOPIFY'] as const;
export type EcommerceProviderValue = (typeof ECOMMERCE_PROVIDERS)[number];

/** Ítem de catálogo (producto, curso, servicio…) sincronizado por el plugin. */
export const catalogItemInputSchema = z.object({
  /** Id en el sistema origen — para variantes (talla/color), el id de la variación. */
  externalId: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(40).default('product'),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20000).optional(),
  url: z.string().trim().max(2000).optional(),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).toUpperCase().default('EUR'),
  available: z.boolean().default(true),
  /** meta.parentId identifica el producto padre de una variante. */
  meta: z.record(z.unknown()).optional(),
});

export const catalogBatchSchema = z.object({
  items: z.array(catalogItemInputSchema).min(1).max(500),
});

export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;
export type CatalogBatchInput = z.infer<typeof catalogBatchSchema>;

/** Respuesta al generar la clave de conexión de un solo uso (handshake del plugin). */
export const ecommerceConnectResponseSchema = z.object({
  connectionKey: z.string(),
  expiresAt: z.string(),
  webhookBaseUrl: z.string(),
});
export type EcommerceConnectResponse = z.infer<typeof ecommerceConnectResponseSchema>;

/** Handshake que hace el plugin recién instalado con la clave pegada en wp-admin. */
export const ecommerceRegisterSchema = z.object({
  connectionKey: z.string().trim().min(10).max(200),
  storeName: z.string().trim().max(200).optional(),
  storeUrl: z.string().trim().max(500).optional(),
  pluginVersion: z.string().trim().max(40).optional(),
});
export type EcommerceRegisterInput = z.infer<typeof ecommerceRegisterSchema>;
