# Converflow para WooCommerce

Plugin de WordPress que conecta cualquier tienda WooCommerce (cualquier
vertical, no solo cursos) con el CRM/motor de IA de Converflow: envía el
historial de pedidos, reembolsos y el catálogo de productos (incluidas
variantes), sin que el tenant tenga que copiar claves de API a mano ni
configurar webhooks en WooCommerce.

## Instalación

1. En Converflow: `Ajustes → Integraciones → WooCommerce → Generar clave de
   conexión`. La clave (`cfwc_...`) caduca en 30 minutos y solo sirve una vez.
2. En WordPress: `Plugins → Añadir nuevo → Subir plugin`, sube el `.zip` y
   actívalo (requiere WooCommerce activo).
3. Ve a `Converflow` en el menú de wp-admin, pega la URL de la API y la clave
   de conexión, y pulsa Conectar.
4. El plugin importa en segundo plano (WP-Cron, paginado) el catálogo y el
   historial de pedidos pagados; a partir de ahí, cada pedido y cambio de
   producto se envía en cuanto ocurre.

## Contrato con el backend

Ver cabecera de `converflow-woocommerce.php` — traduce los datos nativos de
WooCommerce a los dos endpoints ya existentes en Converflow
(`POST /webhooks/{sourceId}` para eventos, `POST /webhooks/{sourceId}/catalog`
para catálogo), firmados con HMAC-SHA256 sobre el cuerpo en crudo.

## Fuera de alcance de esta versión

Suscripciones/renovaciones, reembolsos parciales y pedidos editados a mano
después de creados — ver `docs` del monorepo principal para el detalle de
diseño completo.
