# Plan de ejecución — Motor de IA y RAG multi-tenant de Converflow

## Contexto

Converflow necesita su capa de IA definitiva: un motor conversacional que cualifica y atiende leads con el conocimiento propio de cada tenant, gestión del lead cualificado (resúmenes, handoff, follow-ups) e inteligencia agregada (informes, objeciones, motivos de pérdida), todo sobre un plano de datos que unifica eventos e identidades por tenant. La tesis de retención es arquitectónica: el LLM es intercambiable y sin estado; lo que mejora con el uso (conocimiento, respuestas verificadas, instrucciones, resultados) vive en la memoria del tenant dentro de Postgres. El sistema debe servir a verticales distintos sin desarrollo a medida: **piloto con e-learning/formación y residencias de ancianos (senior living)** — este segundo impone datos sensibles, consentimiento con evidencia y retención configurable desde el primer día.

Decisiones ya tomadas: módulos dentro de `apps/api` + `apps/workers` (no un servicio aparte); foco explícito en embeddings, enrutado de modelos y eficiencia de coste/velocidad; **todo proveedor externo es intercambiable tras una interfaz** — el LLM (hoy Anthropic), el de embeddings, y las fuentes de datos del cliente (Brevo, WooCommerce, LearnDash…) entran como adaptadores de ingesta, nunca como dependencias estructurales.

## Arquitectura (5 niveles)

| Nivel | Piezas | Dónde |
|---|---|---|
| Canales | WhatsApp Meta Cloud API · webchat · email | módulo `channels` (api) + adaptadores |
| Producto | Motor conversacional · Gestión del lead · Inteligencia | módulos `conversation`, `leads` (existente), `insights` |
| Generación | LLM vía API, sin estado, enrutado por tarea | evolución de `common/ai` |
| Memoria por tenant | RAG del negocio · perfil del contacto · instrucciones | módulos `rag`, `profiles` |
| Plano de datos | ingesta de eventos · identidad · ciclo de vida | módulo `ingest` + jobs BullMQ |

Flujo por mensaje: canal → ensamblado de contexto (RAG filtrado por segmento + perfil SQL + instrucciones + reglas de canal) → LLM → respuesta o handoff. Toda corrección humana vuelve como respuesta verificada. Todo lo asíncrono es un job BullMQ.

## Qué se reutiliza del código actual (no se reescribe)

- **Embudo LLM**: `apps/api/src/common/ai/ai.service.ts` — `invoke()`+`describeAiFailure()` (proveedor jamás expuesto al cliente, test propio) se conservan tal cual; `callWithTool`/`runAgentLoop` se adaptan.
- **Presupuesto**: `ai-budget.service.ts` (cap mensual + flag de análisis de entrantes) — la API se conserva; la implementación cambia (ver F0).
- **Traza de negocio**: tabla `ai_usage` — se mantiene como contador de coste/presupuesto; Langfuse añade la traza técnica.
- **Campos personalizados**: `CustomFieldDefinition` (`schema.prisma:609`) + `customFields Json` + `CustomFieldsService.validateValues()` — se **extiende**, no se duplica.
- **Contrato de eventos**: `apps/api/src/modules/leads/lead-timeline.ts` ya define `{type, date, source, payload}` y la UI renderiza tipos desconocidos con fallback — la tabla `events` se materializa detrás de este contrato (drop-in).
- **Patrón de cola**: `apps/api/src/modules/lead-scoring/lead-scoring.queue.ts` (Queue + registerProcessor lazy + shutdown limpio) es la convención para toda cola nueva.
- **Frontera de canal**: `POST /internal/bots/:botId/inbound` + `whatsappEventSchema` — contrato que sobrevive al cambio de transporte WhatsApp.
- **RLS**: `withTenant()` (`packages/db/src/rls.ts`), `rls-policies.sql`, rol `converflow_app`, y el test estático `rls-coverage.spec.ts` que obliga a toda tabla nueva con `tenantId` a tener política `tenant_isolation`.

## Qué se retira (dentro del proyecto)

- `apps/bot-runner/` completo + `BotSession` + flujo QR (Baileys → Meta Cloud API). Punto de corte: los 4 consumidores de `bot-runner.service.ts` (`agent-runtime.service.ts:312`, `conversations.service.ts:91,254`, `campaigns.service.ts:392`, `bots.controller.ts`). Pérdidas asumidas y comunicadas: echo de mensajes enviados desde el móvil, y el envío libre fuera de la ventana de 24h (pasa a plantillas aprobadas).
- Los 4 stubs muertos de `apps/workers/src/index.ts` (`llm/ocr/egress` — `embed` se revive de verdad).
- El poller IMAP legacy (`apps/workers/src/email-poller.ts`) cuando el canal email quede unificado emitiendo eventos.
- Una de las dos implementaciones duplicadas de lead scoring (`leads.service.ts:255` vs `agent-runners/scoring.ts`) — queda la del runner.
- Campos de `agentConfigSchema` validados y jamás leídos (thresholds, watchers, productOwners…): o se implementan en playbooks o se eliminan del schema.

## Modelo de datos nuevo (todas con `tenantId` + política `tenant_isolation` desde el primer script)

| Tabla | Propósito | Notas de implementación |
|---|---|---|
| `events` | Evento normalizado (quién, verbo, objeto, cuándo, fuente, props JSONB) | **Sin particionar al inicio** (volumen piloto); índice `[tenantId, profileId, createdAt]` + `[tenantId, type, createdAt]`. Particionado = decisión futura con datos |
| `profiles` | Perfil unificado del contacto; núcleo + `custom` JSONB | Puente con el CRM actual: `Lead.profileId` nullable |
| `profile_identities` | email/teléfono/wa_id → perfil; matching determinista (email > teléfono) | unique `[tenantId, kind, value]`; absorbe la semántica de `Conversation.contactJid` |
| `lifecycle_definitions` / `lifecycle_states` | Estados y transiciones declarativas por tenant + estado vigente e histórico | El motor evalúa reglas (expresiones sobre eventos/campos) en workers |
| `consents` | Consentimiento por perfil, canal y finalidad, con evidencia (cuándo, dónde, texto mostrado) | Obligatorio para follow-ups; crítico en residencias |
| `rag_collections` | Colecciones por tenant (conocimiento, respuestas verificadas, catálogo) con `embeddingModel` + `dim` | Migrar de modelo de embeddings = re-vectorizar colección, no migrar schema |
| `rag_chunks` | Fragmento + `embedding Unsupported("vector")` + metadatos JSONB (segmento, fuente, vigencia) | Índice HNSW por script SQL; **regla dura: sin PII en el texto** |
| `verified_answers` | Pares pregunta→respuesta generalizados, con segmento; prioridad en recuperación | Nacen de correcciones humanas |
| `tenant_instructions` | Reglas de la casa versionadas → system prompt | Sustituyen al par businessInfo/faqs plano |
| `knowledge_gaps` | Preguntas sin respuesta, agrupadas por similitud, con contador y estado | Prioridad alta si hay lead esperando |
| `catalog_items` | Catálogo sincronizado; descripción al RAG, **precio/stock aquí y consultados en vivo** | e-learning: cursos (LearnDash/TutorLMS); residencias: servicios/habitaciones vía CSV/manual |
| `playbooks` / `playbook_runs` | Acciones automáticas y su resultado | **Toda acción nace en modo borrador-para-aprobar** |
| `regression_sets` / `regression_runs` | Preguntas canónicas por tenant + resultados | Un fallo bloquea el cambio para ese tenant |

Extensión de `CustomFieldDefinition`: columnas `sensitive Boolean`, `retentionDays Int?`, `extractable Boolean`, nuevos `CustomFieldEntity` (PROFILE, CONVERSATION, CATALOG_ITEM), índice GIN sobre los `custom` JSONB + índices de expresión para los 2-3 campos calientes de cada plantilla de vertical.

Reglas duras (cambiarlas exige discusión explícita): RLS con test cross-tenant real en CI · sin PII en textos vectorizados (el contexto va en metadatos filtrables) · precio/stock jamás en un embedding · playbooks en borrador por defecto · el borrado RGPD de un perfil elimina eventos, identidades, estados y consentimientos y no toca la memoria vectorial porque nada personal entró en ella.

## Ingesta: proveedores del cliente como adaptadores intercambiables

`POST /events` autenticado con el `TenantOrApiKeyGuard` existente (scope nuevo `events:write`) + receptores de webhook por fuente. Cada adaptador traduce su origen al esquema común de evento y **nada más** — misma filosofía que el proveedor de LLM: si el cliente ya vive en Brevo, WooCommerce, LearnDash o un CSV, nos conectamos a su sistema; no le pedimos migrar.

- **Brevo (adaptador de entrada)**: si el tenant ya usa Brevo como base de contactos/marketing — import inicial de contactos y listas → `profiles`/`profile_identities`, webhooks de eventos de email (apertura/clic/rebote/baja) → `events`, y sincronización de bajas → `consents`. Brevo no sustituye al envío actual (Resend + SMTP del tenant): es una fuente más.
- **LearnDash/TutorLMS** (e-learning): catálogo de cursos → `catalog_items` + inscripciones/progreso → `events`.
- **WooCommerce/Shopify**: mismo patrón (catálogo + pedidos), se activa cuando llegue un tenant ecommerce.
- **CSV/manual** (residencias): catálogo de servicios y contactos sin sistema origen.
- El correo actual (drivers IMAP del módulo mail) emite eventos hacia `ingest` sin reescribirse.

Requisito técnico nuevo: verificación de firma de webhooks con **raw body** (Fastify hoy no lo expone) + protección de replay — helper común para todos los adaptadores.

## Modelos, embeddings y coste (foco pedido)

- **Enrutado por tarea**: modelo rápido (Haiku) para clasificar, extraer, decidir routing y evaluar reglas; modelo medio (Sonnet) solo para conversar y redactar. El patrón ya existe en mail-draft; se generaliza en la capa `llm` con un mapa tarea→tier configurable.
- **Prompt caching** (palanca de coste nº 1): el system prompt (instrucciones + conocimiento del tenant, hoy hasta 16KB reenviados en cada iteración) se marca con `cache_control`. Objetivo: −60/80% del coste de input en conversación.
- **Batch API** para trabajo no interactivo (informes mensuales, regresión): −50%.
- **Embeddings**: recomendación `voyage-3.5-lite` (multilingüe ES/EN/FR, coste bajo, dimensión configurable); alternativa conservadora `text-embedding-3-small`. Decisión final en F0 con mini-benchmark: 50 preguntas reales por vertical contra un corpus de prueba, midiendo recall@5 y coste. La interfaz `EmbeddingsProvider` y el `embeddingModel`+`dim` por colección hacen el cambio barato.
- **Presupuesto real**: `AiBudgetService` pasa a contador en Redis (hoy caché in-process, inexacto con réplicas) y a **guard central** que envuelve todas las llamadas (hoy solo el análisis de entrantes respeta el cap; scoring masivo y drafts gastan sin tope). `PRICING` sale del código a config y falla con modelo desconocido (hoy: coste 0 silencioso).
- **Coste por conversación** como métrica de producto desde F0 (insumo del pricing por consumo).

## Fases

### F0 · Cimientos (1-2 semanas)
1. **Meta**: solicitud de cuenta WhatsApp Cloud API + plantillas de mensaje (su aprobación es el camino crítico — día 1).
2. **Entorno**: pgvector en dev local (el compose dev ya usa la imagen correcta; arreglar el flujo del schema local), Langfuse **Cloud región UE** (self-host descartado de inicio: exigiría ClickHouse+MinIO en un VPS ya con incidentes de disco/CPU), claves de embeddings.
3. **Operativa que el proyecto exige y hoy no existe**: backups diarios de Postgres fuera del VPS; `@fastify/rate-limit` registrado (instalado y sin usar; `/webchat/*` está expuesto sin límite); healthchecks y límites de recursos en `docker-compose.prod.yml`; **CI ejecutando tests** con Postgres+pgvector de servicio (hoy CI solo hace typecheck+build).
4. **Base de código**: módulos `ingest`/`profiles`/`rag` vacíos registrados en `app.module.ts`; carpeta `packages/db/prisma/sql/` con scripts DDL idempotentes versionados (patrón `rls-policies.sql`) + script `apply:ddl` para HNSW/GIN/expresión; primer script de migración con las tablas nuevas y sus políticas RLS; helper `$queryRaw`-dentro-de-`withTenant` (sin precedente hoy) con su test.
5. **Criterio de aceptación**: el test de integración cross-tenant de recuperación vectorial (dos tenants, misma pregunta, cero filas ajenas) pasa en CI; una llamada LLM trazada en Langfuse con coste correcto.

### F1 · Plano de datos (3-4 semanas)
1. `POST /events` + esquema Zod común en `packages/shared` + colas `ingest`/`identity` con el patrón de lead-scoring.
2. Resolución de identidad determinista + `profiles`; puente `Lead.profileId`; agregación por dominio corporativo (N leads de la misma empresa → alerta B2B).
3. Ciclo de vida configurable (`lifecycle_definitions` + motor en workers). Deuda absorbida: el ingest actual deja de escribir estados legacy (`'NEW'` en `conversation-ingest.service.ts`).
4. Extensión de `CustomFieldDefinition` (sensitive/retention/extractable + entidades nuevas) y unificación del validador duplicado (`leads.service.ts:460`).
5. **Consentimiento y RGPD**: tabla `consents`; y arreglo de la deuda crítica actual — el borrado de lead hoy no audita ni elimina conversaciones/mensajes pese a lo que promete la UI (`leads.service.ts:237`); pasa a borrado verificable por perfil.
6. Adaptadores: Brevo (contactos+eventos) y LearnDash (catálogo+inscripciones). Plantillas de vertical: e-learning y residencias (campos, ciclo de vida, instrucciones ejemplo; la de residencias con sensibilidad/retención poblada).
7. **Aceptación**: una inscripción real de LearnDash (o import Brevo) crea evento, resuelve identidad, transiciona estado y aparece en el perfil con los campos del vertical.

### F2 · Memoria + motor conversacional (4-6 semanas)
1. `rag`: colecciones, vectorización incremental (cola `embed` real en workers), recuperación con filtros de tenant+segmento vía `$queryRaw` en `withTenant`, HNSW.
2. Capa `llm` v2: registro de tools (schema+handler) sustituyendo el catálogo hardcodeado; prompt caching; enrutado por tarea; guard de presupuesto central.
3. Ensamblado de contexto + **extracción estructurada generada desde `field_definitions` extraíbles** (el bot captura lo que el panel define, sin código por tenant).
4. Webchat con fallback: sin barrera de entrada; cuando no sabe responder → «te contactamos por el canal que elijas» → registra consentimiento con evidencia, crea `knowledge_gap` prioritario y dispara playbook de respuesta diferida.
5. WhatsApp Meta Cloud API: adaptador Meta→`whatsappEventSchema`; envío con plantillas y ventana 24h; retirada de Baileys planificada (se ejecuta en F4 tras convivencia).
6. **Aceptación**: conversación real en webchat que responde con conocimiento del tenant, extrae campos personalizados al CRM y, ante una laguna, ofrece contacto y lo registra.

### F3 · Gestión del lead (3-4 semanas)
1. Resúmenes de conversación y handoff con contexto (evoluciona `mail-ai`/`agent-runtime` existentes).
2. Corrección humana → `verified_answers` (generalización + segmento); prioridad sobre RAG base.
3. Enriquecimiento fase 1 (dominio corporativo → web pública → perfil estructurado); proveedor API bajo demanda solo para score alto y solo con proveedor que asuma cumplimiento.
4. Follow-ups por playbook con guardarraíles: frecuencia por contacto, ventanas horarias, supresiones y consentimiento, **borrador-para-aprobar** hasta que el tenant lo pase a automático.
5. Unificación del scoring (muere el duplicado) leyendo campos personalizados vía definiciones.
6. **Aceptación**: una corrección humana hace que la siguiente pregunta similar se responda sola; un evento de abandono genera borrador de follow-up que el tenant aprueba y se envía.

### F4 · Mejora e inteligencia (3-4 semanas)
1. Lagunas agrupadas por similitud con flujo de cierre (el tenant responde → respuesta verificada).
2. Informe mensual con curva de mejora (resolución sin humano, lagunas cerradas, conversiones) — vía Batch API.
3. Aprendizaje por resultados en playbooks (`playbook_runs`).
4. Set de regresión operativo (30-50 preguntas canónicas/tenant; cambio que rompe una → bloqueado para ese tenant).
5. Retirada efectiva de `bot-runner` + limpieza (poller legacy, stubs, config muerta de agentes).
6. **Aceptación**: el informe del piloto muestra tasa de resolución creciente; una regresión detectada bloquea un cambio de conocimiento.

Piloto: 2-3 tenants reales (e-learning + residencias) desde F2, revisión semanal de trazas. F3/F4 se reordenan según lo que pidan.

## Riesgos y mitigación

- **Aislamiento vectorial entre tenants** (riesgo reputacional máximo): RLS + transacción + test de integración en CI, bloqueante desde F0.
- **Aprobaciones de Meta lentas**: solicitar día 1; el webchat no depende de ellas.
- **Capacidad del VPS**: Langfuse fuera (Cloud UE), límites de recursos y backups dentro, jobs pesados con concurrencia acotada.
- **Coste fuera de presupuesto**: enrutado + caching + guard central + visibilidad por conversación desde F0.
- **Datos sensibles (residencias)**: sensibilidad/retención por campo desde F1, consentimiento con evidencia, DPA con cada tenant, nada personal en vectores.
- **Respuestas verificadas vs conocimiento base**: prioridad explícita de colección + vigencia + regresión.
- **Sobre-ingeniería del plano de datos**: un esquema de evento y 2-3 adaptadores; no es Segment.
- **Autonomía prematura**: todo playbook nace en borrador; la autonomía se gana por playbook y por tenant.

## Verificación global

- Cada fase cierra con su criterio de aceptación demostrado en el entorno del piloto.
- CI en verde con los tests nuevos (cross-tenant vectorial, identidad, ciclo de vida, presupuesto) en cada merge.
- Coste por conversación visible en Langfuse desde F0 y decreciente tras F2 (caching).
- `rls-coverage.spec.ts` cubre todas las tablas nuevas desde su primer script.

## Primer paso al aprobar

Ejecutar F0.1–F0.4 (solicitud Meta, entorno, operativa, esqueleto de módulos y primer script DDL con RLS) y traer el mini-benchmark de embeddings con datos reales de los dos verticales para cerrar esa decisión.
