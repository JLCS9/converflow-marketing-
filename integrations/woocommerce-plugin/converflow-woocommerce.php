<?php
/**
 * Plugin Name: Converflow para WooCommerce
 * Description: Envía a Converflow el historial de pedidos y el catálogo de tu tienda WooCommerce, para cualquier vertical (no solo cursos): quién compra, cuándo y qué compra. Instala, pega la clave de conexión y listo — sin claves de API que copiar a mano ni webhooks que configurar tú mismo.
 * Version: 1.0.0
 * Author: Converflow
 * Requires Plugins: woocommerce
 * License: proprietary
 * Text Domain: converflow-woocommerce
 *
 * Contrato con el backend (apps/api/src/modules/ingest/webhooks.controller.ts +
 * apps/api/src/modules/ingest/adapters/adapters.ts#translateWoocommerce):
 *   POST {api_base}/webhooks/{sourceId}            → eventos (purchase/refund)
 *   POST {api_base}/webhooks/{sourceId}/catalog     → catálogo (productos/variantes)
 * Ambos firmados con HMAC-SHA256 en base64 sobre el raw body, cabecera
 * X-WC-Webhook-Signature. Cada evento lleva `externalId` para que un
 * reintento no duplique nada del lado de Converflow — este plugin NO
 * necesita lógica perfecta de "solo una vez", puede disparar de más.
 */

if (!defined('ABSPATH')) exit;

define('CFWC_VERSION', '1.0.0');
define('CFWC_OPTION', 'cfwc_connection');
define('CFWC_BACKFILL_HOOK', 'cfwc_backfill_batch');
define('CFWC_BATCH_SIZE', 200); // margen bajo el límite del backend (500) para cuerpos ligeros

// ---------------------------------------------------------------------------
// Conexión: estado guardado en wp_options (nunca en la BD del tenant en Woo).
// ---------------------------------------------------------------------------

function cfwc_get_connection() {
    return get_option(CFWC_OPTION, null);
}

function cfwc_save_connection($data) {
    update_option(CFWC_OPTION, $data, false);
}

function cfwc_is_connected() {
    $c = cfwc_get_connection();
    return !empty($c['secret']) && !empty($c['events_webhook_url']);
}

// ---------------------------------------------------------------------------
// Firma HMAC — igual que verifyHmacSignature() en el backend.
// ---------------------------------------------------------------------------

function cfwc_sign($raw_body, $secret) {
    return base64_encode(hash_hmac('sha256', $raw_body, $secret, true));
}

/**
 * POST firmado. Nunca lanza — un fallo de red no debe tumbar el guardado de
 * un pedido en WooCommerce. Devuelve true/false para que el llamador decida
 * si reintentar (backfill) o simplemente loguear (hooks en vivo).
 */
function cfwc_post_signed($url, $secret, $body_array, $plugin_version_header = true) {
    $raw = wp_json_encode($body_array);
    $headers = [
        'Content-Type' => 'application/json',
        'X-WC-Webhook-Signature' => cfwc_sign($raw, $secret),
    ];
    if ($plugin_version_header) $headers['X-CF-Plugin-Version'] = CFWC_VERSION;

    $res = wp_remote_post($url, [
        'headers' => $headers,
        'body' => $raw,
        'timeout' => 15,
    ]);
    if (is_wp_error($res)) {
        error_log('[Converflow] envío falló: ' . $res->get_error_message());
        return false;
    }
    $code = wp_remote_retrieve_response_code($res);
    // El backend responde SIEMPRE 202/200 salvo firma inválida (401) o fuente
    // desactivada (404) — ninguno de los dos se arregla reintentando ya mismo.
    return $code >= 200 && $code < 300;
}

// ---------------------------------------------------------------------------
// Handshake: pega la clave de conexión (generada en Converflow → Ajustes →
// Integraciones) y este plugin hace POST /integrations/woocommerce/register.
// La clave es de UN SOLO USO — el secreto real que firma cada webhook lo
// devuelve el servidor en la respuesta y es lo único que se guarda después.
// ---------------------------------------------------------------------------

function cfwc_register($api_base, $connection_key) {
    $api_base = untrailingslashit($api_base);
    $res = wp_remote_post($api_base . '/integrations/woocommerce/register', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'connectionKey' => $connection_key,
            'storeName' => get_bloginfo('name'),
            'storeUrl' => home_url(),
            'pluginVersion' => CFWC_VERSION,
        ]),
        'timeout' => 15,
    ]);
    if (is_wp_error($res)) {
        return new WP_Error('cfwc_connect_failed', $res->get_error_message());
    }
    $code = wp_remote_retrieve_response_code($res);
    $data = json_decode(wp_remote_retrieve_body($res), true);
    if (($code !== 200 && $code !== 201) || empty($data['secret'])) {
        return new WP_Error('cfwc_connect_failed', 'Clave de conexión inválida o caducada. Genera una nueva desde Converflow.');
    }
    cfwc_save_connection([
        'api_base' => $api_base,
        'secret' => $data['secret'],
        'events_webhook_url' => $data['eventsWebhookUrl'],
        'catalog_webhook_url' => $data['catalogWebhookUrl'],
        'connected_at' => time(),
    ]);
    return true;
}

// ---------------------------------------------------------------------------
// Pedidos → evento 'purchase' / 'refund'. Un pedido dispara 'purchase' la
// PRIMERA vez que cruza a processing/completed (marca postmeta para no
// repetir en cada cambio de estado posterior a "ya pagado" — el backend
// dedupe igualmente por externalId, esto solo ahorra llamadas).
// ---------------------------------------------------------------------------

function cfwc_order_to_props($order) {
    $items = [];
    foreach ($order->get_items() as $item) {
        $items[] = [
            'productId' => (string) $item->get_product_id(),
            'name' => $item->get_name(),
            'qty' => $item->get_quantity(),
            'total' => (string) $item->get_total(),
        ];
    }
    return [
        'orderId' => (string) $order->get_id(),
        'orderNumber' => $order->get_order_number(),
        'name' => sprintf('Pedido #%s', $order->get_order_number()),
        'amount' => (string) $order->get_total(),
        'currency' => $order->get_currency(),
        'status' => $order->get_status(),
        'customerName' => trim($order->get_formatted_billing_full_name()),
        'company' => $order->get_billing_company() ?: null,
        'lineItems' => $items,
    ];
}

function cfwc_maybe_send_purchase($order_id) {
    if (!cfwc_is_connected()) return;
    $order = wc_get_order($order_id);
    if (!$order) return;
    if (!in_array($order->get_status(), ['processing', 'completed'], true)) return;
    if ($order->get_meta('_cfwc_purchase_sent') === 'yes') return; // ahorro de llamada, no de corrección

    $email = $order->get_billing_email();
    if (!$email) return;

    $conn = cfwc_get_connection();
    $sent = cfwc_post_signed($conn['events_webhook_url'], $conn['secret'], [
        'events' => [[
            'type' => 'purchase',
            'occurredAt' => $order->get_date_paid() ? $order->get_date_paid()->format('c') : $order->get_date_created()->format('c'),
            'externalId' => 'order:' . $order->get_id(),
            'identity' => ['email' => $email],
            'props' => cfwc_order_to_props($order),
        ]],
    ]);
    if ($sent) $order->update_meta_data('_cfwc_purchase_sent', 'yes');
    $order->save_meta_data();
}
add_action('woocommerce_order_status_changed', 'cfwc_maybe_send_purchase', 10, 1);

function cfwc_maybe_send_refund($order_id) {
    if (!cfwc_is_connected()) return;
    $order = wc_get_order($order_id);
    if (!$order) return;
    if (!in_array($order->get_status(), ['refunded', 'cancelled'], true)) return;
    if ($order->get_meta('_cfwc_purchase_sent') !== 'yes') return; // nunca se contó como venta: nada que reembolsar

    $conn = cfwc_get_connection();
    cfwc_post_signed($conn['events_webhook_url'], $conn['secret'], [
        'events' => [[
            'type' => 'refund',
            'occurredAt' => current_time('c'),
            'externalId' => 'refund:' . $order->get_id(),
            'props' => ['orderId' => (string) $order->get_id(), 'amount' => (string) $order->get_total()],
        ]],
    ]);
}
add_action('woocommerce_order_status_changed', 'cfwc_maybe_send_refund', 10, 1);

// ---------------------------------------------------------------------------
// Catálogo → upsert inmediato al crear/editar un producto (incluidas
// variaciones: cada una es su propio CatalogItem con meta.parentId).
// ---------------------------------------------------------------------------

function cfwc_product_to_item($product) {
    $parent_id = $product->get_parent_id();
    return [
        'externalId' => (string) $product->get_id(),
        'kind' => 'product',
        'name' => $product->get_name(),
        'description' => wp_strip_all_tags($product->get_description()),
        'url' => get_permalink($parent_id ?: $product->get_id()),
        'price' => $product->get_price() !== '' ? (string) $product->get_price() : null,
        'currency' => get_woocommerce_currency(),
        'available' => $product->is_in_stock() && $product->get_status() === 'publish',
        'meta' => $parent_id ? ['parentId' => (string) $parent_id] : null,
    ];
}

function cfwc_sync_product($product_id) {
    if (!cfwc_is_connected()) return;
    $product = wc_get_product($product_id);
    if (!$product) return;
    $conn = cfwc_get_connection();
    cfwc_post_signed($conn['catalog_webhook_url'], $conn['secret'], ['items' => [cfwc_product_to_item($product)]]);
}
add_action('woocommerce_update_product', 'cfwc_sync_product', 10, 1);
add_action('woocommerce_new_product', 'cfwc_sync_product', 10, 1);
add_action('woocommerce_update_product_variation', 'cfwc_sync_product', 10, 1);
add_action('woocommerce_new_product_variation', 'cfwc_sync_product', 10, 1);
add_action('woocommerce_before_delete_product', function ($product_id) {
    // Soft-delete: nunca se borra un CatalogItem por sincronización.
    if (!cfwc_is_connected()) return;
    $product = wc_get_product($product_id);
    if (!$product) return;
    $item = cfwc_product_to_item($product);
    $item['available'] = false;
    $conn = cfwc_get_connection();
    cfwc_post_signed($conn['catalog_webhook_url'], $conn['secret'], ['items' => [$item]]);
});

// ---------------------------------------------------------------------------
// Backfill inicial: pedidos y catálogo históricos, paginado por WP-Cron para
// no bloquear el guardado de ajustes ni caer en timeout de PHP en tiendas
// grandes. Progreso persistido en options — resumible si el cron muere.
// ---------------------------------------------------------------------------

function cfwc_start_backfill() {
    update_option('cfwc_backfill_progress', ['orders_page' => 1, 'products_page' => 1, 'done' => false], false);
    if (!wp_next_scheduled(CFWC_BACKFILL_HOOK)) {
        wp_schedule_single_event(time() + 5, CFWC_BACKFILL_HOOK);
    }
}

add_action(CFWC_BACKFILL_HOOK, function () {
    if (!cfwc_is_connected()) return;
    $progress = get_option('cfwc_backfill_progress', ['orders_page' => 1, 'products_page' => 1, 'done' => false]);
    if (!empty($progress['done'])) return;
    $conn = cfwc_get_connection();
    $more_work = false;

    // Productos (y sus variaciones) primero: para cuando lleguen los pedidos
    // históricos, el catálogo ya puede resolver sus lineItems.
    if (empty($progress['products_done'])) {
        $products = wc_get_products(['limit' => CFWC_BATCH_SIZE, 'page' => $progress['products_page'], 'status' => 'publish']);
        if (count($products) > 0) {
            $items = array_map('cfwc_product_to_item', $products);
            cfwc_post_signed($conn['catalog_webhook_url'], $conn['secret'], ['items' => $items]);
            $progress['products_page']++;
            $more_work = true;
        } else {
            $progress['products_done'] = true;
        }
    } elseif (empty($progress['done'])) {
        $orders = wc_get_orders([
            'limit' => CFWC_BATCH_SIZE,
            'page' => $progress['orders_page'],
            'status' => ['processing', 'completed'],
        ]);
        if (count($orders) > 0) {
            $events = [];
            foreach ($orders as $order) {
                $email = $order->get_billing_email();
                if (!$email) continue;
                $events[] = [
                    'type' => 'purchase',
                    'occurredAt' => $order->get_date_paid() ? $order->get_date_paid()->format('c') : $order->get_date_created()->format('c'),
                    'externalId' => 'order:' . $order->get_id(),
                    'identity' => ['email' => $email],
                    'props' => cfwc_order_to_props($order),
                ];
            }
            if ($events) cfwc_post_signed($conn['events_webhook_url'], $conn['secret'], ['events' => $events]);
            foreach ($orders as $order) $order->update_meta_data('_cfwc_purchase_sent', 'yes');
            foreach ($orders as $order) $order->save_meta_data();
            $progress['orders_page']++;
            $more_work = true;
        } else {
            $progress['done'] = true;
        }
    }

    update_option('cfwc_backfill_progress', $progress, false);
    if ($more_work && empty($progress['done'])) {
        wp_schedule_single_event(time() + 10, CFWC_BACKFILL_HOOK); // ritmo pausado: no satura la tienda ni Converflow
    }
});

// ---------------------------------------------------------------------------
// Pantalla de ajustes en wp-admin.
// ---------------------------------------------------------------------------

add_action('admin_menu', function () {
    add_menu_page('Converflow', 'Converflow', 'manage_woocommerce', 'converflow-woocommerce', 'cfwc_render_settings_page', 'dashicons-cart');
});

function cfwc_render_settings_page() {
    if (!current_user_can('manage_woocommerce')) return;

    if (isset($_POST['cfwc_connect_nonce']) && wp_verify_nonce($_POST['cfwc_connect_nonce'], 'cfwc_connect')) {
        $api_base = isset($_POST['cfwc_api_base']) ? esc_url_raw(trim($_POST['cfwc_api_base'])) : '';
        $key = isset($_POST['cfwc_connection_key']) ? sanitize_text_field(trim($_POST['cfwc_connection_key'])) : '';
        $result = cfwc_register($api_base, $key);
        if (is_wp_error($result)) {
            echo '<div class="notice notice-error"><p>' . esc_html($result->get_error_message()) . '</p></div>';
        } else {
            echo '<div class="notice notice-success"><p>Tienda conectada. Importando historial en segundo plano…</p></div>';
            cfwc_start_backfill();
        }
    }
    if (isset($_POST['cfwc_disconnect_nonce']) && wp_verify_nonce($_POST['cfwc_disconnect_nonce'], 'cfwc_disconnect')) {
        delete_option(CFWC_OPTION);
        delete_option('cfwc_backfill_progress');
        echo '<div class="notice notice-success"><p>Desconectado.</p></div>';
    }

    $conn = cfwc_get_connection();
    $progress = get_option('cfwc_backfill_progress', null);
    ?>
    <div class="wrap">
        <h1>Converflow para WooCommerce</h1>
        <?php if (cfwc_is_connected()): ?>
            <p>✅ Conectado a <code><?php echo esc_html($conn['api_base']); ?></code> desde
               <?php echo esc_html(date('Y-m-d H:i', $conn['connected_at'])); ?>.</p>
            <?php if ($progress): ?>
                <p>Historial: pedidos página <?php echo (int) $progress['orders_page']; ?>,
                   productos página <?php echo (int) $progress['products_page']; ?>
                   <?php echo !empty($progress['done']) ? '— completo.' : '— en curso.'; ?></p>
            <?php endif; ?>
            <form method="post">
                <?php wp_nonce_field('cfwc_disconnect', 'cfwc_disconnect_nonce'); ?>
                <button type="submit" class="button">Desconectar</button>
            </form>
        <?php else: ?>
            <p>Pega aquí la clave de conexión que generaste en Converflow → Ajustes → Integraciones → WooCommerce.
               Caduca en 30 minutos y solo sirve una vez.</p>
            <form method="post">
                <?php wp_nonce_field('cfwc_connect', 'cfwc_connect_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th><label for="cfwc_api_base">URL de la API de Converflow</label></th>
                        <td><input type="url" id="cfwc_api_base" name="cfwc_api_base" class="regular-text"
                                   value="https://api.converflow.ai" required></td>
                    </tr>
                    <tr>
                        <th><label for="cfwc_connection_key">Clave de conexión</label></th>
                        <td><input type="text" id="cfwc_connection_key" name="cfwc_connection_key"
                                   class="regular-text" placeholder="cfwc_..." required></td>
                    </tr>
                </table>
                <button type="submit" class="button button-primary">Conectar</button>
            </form>
        <?php endif; ?>
    </div>
    <?php
}
