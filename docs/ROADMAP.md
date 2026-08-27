# Roadmap — evolución del correo con IA

> Plan acordado el 2026-08-27 tras una revisión de código completa del monorepo.
> Contexto: **1-2 clientes piloto controlados**. Eje: **estabilizar el correo y
> hacerlo evolucionar con IA** (potenciar, traducir, optimizar tiempos).
> Orden de ejecución: **A → B → C → D → E → F**. Actualiza este fichero al cerrar
> cada sprint y refleja el resultado en `CURRENT_STATE.md`.

## 🔴 P0 encontrado y corregido — 5 tablas de tenant sin RLS

Descubierto al levantar el entorno local para la verificación visual del Sprint B
(2026-08-27). **`api_keys`, `campaigns`, `campaign_recipients`, `suppressions` y
`email_templates` son tablas con `tenantId` que nunca se añadieron a
`rls-policies.sql`**, mientras los servicios las consultan dentro de
`withTenant()` **sin filtro explícito de tenantId** (`CampaignsService.list` es
un `campaign.findMany({orderBy})` pelado). Es la misma clase de fallo que la
lección #0, en las tablas creadas después de arreglarla.

Demostrado empíricamente conectando como `converflow_app` (NOSUPERUSER
NOBYPASSRLS, el rol que usa la API en producción) con `app.tenant_id` fijado al
tenant A:

| Tabla | Antes | Después |
|---|---|---|
| `leads` (tenía RLS) | solo «Lead de A» | solo «Lead de A» |
| `campaigns` | **«Campaña de A, Campaña de B»** | solo «Campaña de A» |
| `email_templates` | **«Plantilla A, Plantilla B»** | solo «Plantilla A» |
| `campaigns` por id ajeno | **accesible** | no accesible |

Impacto real: `GET /campaigns`, `GET /email-templates` y `GET /api-keys`
devolvían filas de **todos** los tenants; `findUnique({id})` permitía leer —y
`launch`/`cancel`— la campaña de otro tenant. Y `resolveCampaignAgent` en
`conversation-ingest` podía emparejar el destinatario de campaña de **otro**
tenant por dirección de correo y enrutar la conversación a su agente de IA.

**Corregido** en `rls-policies.sql` (política `tenant_isolation` + `FORCE` en las
cinco). Auditados todos los accesos: van por `withTenant` o `bypass`, y todos los
`create` fijan `tenantId`, así que activar RLS no rompe ninguna ruta.

**Regresión cubierta**: `apps/api/src/common/prisma/rls-coverage.spec.ts` recorre
el schema, encuentra cada modelo con `tenantId` y exige `ENABLE` + `FORCE` +
política en el SQL (35 tests, sin necesidad de base de datos). Validado quitando
a mano una política: el test falla.

> ⚠️ **Deploy: hay que ejecutar `pnpm --filter @converflow/db apply:rls` en
> producción.** Hasta entonces la fuga sigue viva. Es idempotente.

---

## Estado de partida (verificado, no asumido)

`typecheck` ✅ · `test` ✅ 28/28 (solo módulo mail) · `lint` ✅ (arreglado, ver abajo).

**Ya aplicado** (working tree, sin commit — quick wins de bajo riesgo):

| Ítem | Qué era | Fichero |
|---|---|---|
| E1 | `pnpm lint` en rojo → puerta de CI y husky muertas | `packages/shared/src/utils.ts:26`, `eslint.config.mjs`, `apps/web/eslint.config.mjs` |
| E1 | 8 artefactos de build de mayo versionados **dentro de `src/`** — con imports NodeNext (`.js`) un `src/index.js` obsoleto puede ensombrecer a `src/index.ts` | `apps/{bot-runner,workers}/src/` + `.gitignore` |
| E1 | `next lint` (deprecado en Next 15, eliminado en 16) → `eslint .` con plugins Next + react-hooks registrados | `apps/web/` |
| E5 | El asunto de campaña no sustituía `{variables}` → los destinatarios leían «Hola {nombre}» | `campaigns.service.ts:359` |
| E11 | «Marcar no leído» escribía `unreadCount: 1`, destruyendo el contador real | `mail-inbox.service.ts:205` |
| E12 | Token interno comparado con `!==` (oráculo de temporización) | `internal-token.guard.ts` |
| — | `totpSecret` del super admin en texto plano → AES-256-GCM, con lectura compatible y re-cifrado oportunista al primer login (sin migración manual, nadie se queda fuera) | `auth-admin.service.ts` |

---

## Sprint A — «el correo no se cae» ✅ HECHO (working tree, sin commit)

Los 4 ítems implementados y verificados: `typecheck` 8/8 · `lint` 6/6 ·
`test` **44/44** (16 tests nuevos). ⚠️ **El deploy requiere `prisma db push`**
(columnas nuevas en `mail_connections` + valor `DEGRADED` en `MailConnStatus`).
No hace falta `apply:rls` — no hay tablas nuevas.

1. ✅ **E3 · desdoblar `secure` en `smtpSecure` / `imapSecure`**
   Un único flag booleano gobernaba SMTP e IMAP. El preset de Outlook/365 fija
   `secure: false` por el SMTP 587 (STARTTLS) y eso se aplicaba también al IMAP
   993 (TLS implícito) → **nunca conectaba**.
   **Implementado**: `resolveSecure(explícito → puerto → flag legacy)` en
   `drivers/mail-driver.ts`. Las filas existentes no necesitan migración de datos:
   las columnas nuevas son NULL y el TLS se deriva del puerto, que es más fiable
   que el flag antiguo. Extra: `requireTLS` en puertos STARTTLS, para que un
   servidor sin STARTTLS no reciba la contraseña en claro. La UI ya no pregunta
   por TLS — lo deduce y lo muestra, con override en «Avanzado».

2. ✅ **E2 · backoff en vez de `ERROR` permanente**
   `mail-sync.service.ts:96` marca `status: 'ERROR'` ante *cualquier* excepción
   (timeout de red, parser), y el scheduler solo consulta `status: 'CONNECTED'`
   (`:37`). Nada automático revierte a `CONNECTED` — solo `testSend`/`testSync`/
   `update`, todos manuales. **Un corte de red deja el buzón muerto para siempre**,
   y el único aviso es un `WARN` en logs.
   **Implementado**: estado nuevo `DEGRADED` (fallo transitorio, se sigue
   sincronizando con backoff 1→30 min) frente a `ERROR` (requiere humano: error de
   autenticación, o 8 fallos seguidos). El scheduler selecciona
   `status IN (CONNECTED, DEGRADED)` y respeta `nextRetryAt`; ordena por
   `lastSyncedAt asc` para que el tope de 100 haga round-robin en vez de dejar
   buzones sin sincronizar nunca. Al escalar a ERROR se avisa **una vez** al
   responsable (owner del buzón si es privado, OWNER del tenant si es compartido)
   por la vía de sistema — no por el buzón averiado. Un `test-sync` manual con
   éxito limpia los contadores y reactiva el buzón.

3. ✅ **E8 · los correos propios dejan de aparecer en Recibidos**
   `createThread` (compose y forward) fijaba `folder: 'INBOX'` y `sendDraft` movía
   el hilo de `DRAFTS` → `INBOX`.
   **Implementado**: los hilos que originamos nacen en `SENT` y un borrador
   enviado pasa de `DRAFTS` a `SENT`. Cuando el contacto responde, el ingest lo
   sube a `INBOX` — comportamiento Gmail.

4. ✅ **E9 · `APPEND` IMAP a la carpeta Enviados del buzón real**
   Se enviaba por SMTP sin `APPEND`, así que **nada de lo enviado desde Converflow
   aparecía en el Gmail/Outlook del cliente**.
   **Implementado**: el Message-ID lo generamos nosotros antes de enviar (así la
   copia archivada lleva el MISMO id que el correo enviado; si no, el cliente de
   correo del usuario vería dos hilos), el MIME se recompone con un transporte
   `streamTransport` y se hace `APPEND` con `\Seen`. La carpeta se localiza por el
   flag RFC 6154 `\Sent` (independiente del idioma) con respaldo por nombre
   conocido (Enviados / Sent Items / Gesendet…). **Se omite en Gmail**, que ya
   archiva por su cuenta y provocaría duplicados. No se espera al APPEND: es un
   segundo viaje IMAP y jamás debe retrasar ni romper un envío que ya salió.

### Verificación en producción tras el deploy

1. Conectar un buzón Outlook/365 con el preset → debe quedar «Conectado» (antes fallaba siempre).
2. Enviar un correo desde Converflow → debe aparecer en el «Enviados» del buzón real,
   y el hilo debe listarse en Enviados, no en Recibidos.
3. `docker logs cfai-api | grep -i "mail sync degraded"` tras un fallo de red → debe
   reintentar, no morir.

---

## Sprint B — «bandeja de correo, no chat» ✅ HECHO (working tree, sin commit)

`typecheck` 8/8 · `lint` 6/6 · `test` **53/53** (9 nuevos) · `next build` OK.
⚠️ **Deploy: `prisma db push`** (`email_messages.sentByUserId` + FK e índice).
Sin `apply:rls` (no hay tablas nuevas).

**Problema raíz:** el hilo reutilizaba el componente de Mensajería — burbujas de
chat con `flex-row-reverse` para los salientes y la etiqueta `"Tú"`. Esa metáfora
oculta justo lo que importa en correo: quién escribe, a quién y quién va en copia.

- ✅ **Cabecera real por mensaje** (`mail-message-card.tsx`). `De` · `Para` · `Cc`
  visibles al abrir cada mensaje, y un desplegable «Detalles» con `Cco`, fecha
  completa, asunto y quién envió. Los tres campos **ya viajaban al navegador y
  ningún JSX los usaba**. Las direcciones se etiquetan con el nombre del contacto
  CRM o del buzón propio, con el email en gris al lado.
- ✅ **Fuera la metáfora de chat.** Tarjetas a ancho completo, colapsadas salvo la
  última, con un botón «N mensajes anteriores» que pliega el centro del hilo
  (se conservan siempre el primero y la cola reciente).
  **Mejora sobre el plan**: también arrancan abiertos los mensajes entrantes **sin
  leer** — llegar a un hilo con tres respuestas nuevas y encontrarlas plegadas
  sería peor que inútil. El estado abierto/cerrado vive en cada tarjeta (con clave
  por id de mensaje), así el sondeo de 12 s no puede cerrar lo que estás leyendo.
- ✅ **`EmailMessage.sentByUserId`** + relación `sentBy` → la cabecera dice
  «María G. **vía** ventas@empresa.com». Se escribe en los **5** caminos de envío
  (`reply`, `compose`, `forward`, `saveDraft` y `sendDraft` — quien pulsa enviar es
  el que firma, aunque otro redactara el borrador). Las filas antiguas se muestran
  como «Tu equipo»: mejor impreciso que atribuido a la persona equivocada.
- ✅ **Tres tratamientos visuales** — contacto (blanco) / yo (azul) / compañero
  (violeta) — en lugar de izquierda-derecha.
- ✅ **Lista de hilos**: indicador `+N` con tooltip de participantes cuando el hilo
  tiene más de una persona, para no descubrir el Cc solo al abrirlo.
- ✅ **O4 · paginación por cursor** (`keyset`, no OFFSET: con OFFSET la página 2
  duplica o se salta hilos cada vez que entra correo). `GET …/threads` y
  `…/search` devuelven `{ items, nextCursor }`, página de 40 y tope de 100.
  Botón «Cargar más correos» con de-duplicación por id.
  **Dos bugs cazados por sus propios tests**: (1) el cursor se pasaba con spread
  y el `OR` de la búsqueda lo sobrescribía → la página 2 devolvía la 1 para
  siempre; ahora va en `AND`. (2) `lastIndexOf` partía mal el cursor si el id
  contenía `|`; ahora `indexOf`, que es correcto porque la fecha ISO no lo lleva.
- ✅ **Refactor.** `mail-workspace.tsx` 929 → **781** líneas, y salen
  `mail-types.ts` (107), `mail-message-card.tsx` (~320) y
  `mail-thread-list.tsx` (~170).

### Verificación en producción tras el deploy

1. Abrir un hilo con Cc → deben verse `De`/`Para`/`Cc` y el desplegable «Detalles».
2. Responder desde un buzón compartido con dos usuarios distintos → cada mensaje
   debe mostrar el nombre de quien envió, no «Tú».
3. Un buzón con más de 40 hilos → debe aparecer «Cargar más correos» y no repetir hilos.

### ✅ Verificado visualmente en local (2026-08-27)

Entorno local levantado con Postgres 15 de Homebrew (sin Docker) + fixture
(`apps/api/scripts/mail-fixture.local.ts`, ignorado por git y por eslint): buzón
compartido con un hilo de 5 mensajes, Cc, y respuestas de **dos** usuarios
distintos, más 48 hilos para la paginación. Comprobado en el navegador:
cabeceras De/Para/Cc, «1 mensaje anterior», los tres tratamientos de color,
«Detalles», el `+N` de participantes, y «Cargar más» (49 filas, sin duplicados,
sobreviviendo al sondeo). El backoff del Sprint A también se vio **en vivo**: el
buzón del fixture apunta a un host inexistente y quedó en `DEGRADED` con
`consecutiveFailures=3` y `nextRetryAt`, en lugar de morir en `ERROR`.

**Tres bugs que solo aparecieron al mirar** (ninguno lo cazaban los tests):

1. **El `Cc` mentía.** `labelFor` ponía el nombre del contacto CRM a *cualquier*
   dirección del hilo, así que la cabecera afirmaba que `compras@acme.test` era
   «Ana Ruiz». Ahora solo se etiqueta la dirección de la que se resolvió el
   contacto (`participants[0]`).
2. **Hora equivocada en los salientes.** La tarjeta usaba
   `receivedAt || createdAt`; en OUT `receivedAt` es null, así que mostraba la
   hora de inserción de la fila en vez del envío. Ahora
   `sentAt || receivedAt || createdAt`. En producción casi coinciden, pero en
   borradores enviados y datos importados no.
3. **El sondeo se comía la paginación.** Cada 15 s `loadThreads` hacía
   `setThreads(items)` y tiraba todas las páginas cargadas con «Cargar más»: la
   lista volvía a 40 filas a los pocos segundos. Ahora fusiona por id (los
   frescos primero, se elimina la copia obsoleta del que sube) y no toca el
   cursor una vez paginado.

### 🐞 Hallazgos de entorno de desarrollo (fuera de Sprint B)

- **`pnpm dev` no arranca la API, por dos motivos independientes.**
  (a) Faltaba `@fastify/static`, que `SwaggerModule.setup()` necesita — **ya
  añadido**; en producción no salta porque Swagger está desactivado.
  (b) El script `dev` usa `tsx`, y esbuild **no emite `emitDecoratorMetadata`**,
  que es de lo que depende la inyección por constructor de NestJS: los servicios
  arrancan con dependencias `undefined` y revienta en
  `LeadScoringService.onModuleInit` (`this.queue` undefined). **Sin arreglar** —
  la decisión es tuya: `@nestjs/cli` (`nest start --watch`), o `tsc --watch` +
  `node --watch dist/main.js` sin añadir dependencias. Para la verificación se
  compiló con `tsc` y se arrancó `dist/main.js`, que es como corre en producción.
- **pgvector no está instalado en el Postgres local.** No lo necesita ningún
  modelo todavía (la extensión está declarada para el RAG futuro), así que el
  push local se hizo con una copia del schema sin ella. Cuando llegue el RAG,
  hará falta `brew install pgvector` para poder trabajar en local.

---

## Sprint C — IA de lectura: Resumen + Traducir ✅ HECHO

`typecheck` 8/8 · `lint` 6/6 · `test` **117/117** (21 nuevos).
⚠️ **Deploy: `prisma db push` + `apply:rls`** (caché de resumen en
`email_threads`, `email_messages.detectedLang`, y la tabla nueva
`email_message_translations`, que **sí necesita política RLS**).

- **Resumen** — `POST /mail/threads/:id/ai/summary`, con `force` para regenerar.
  Viñetas + «te piden» + siguiente paso + estado (te toca / esperando / bloqueado
  / cerrado). Cacheado con el recuento de mensajes que lo hizo válido: si el hilo
  crece, se recalcula; si no, sale gratis. **No se genera al abrir el hilo** — lo
  pide el usuario, porque el sondeo de 12 s lo dispararía en cada tick. Haiku.
- **Traducir** — `POST /mail/messages/:id/ai/translate`. Solo texto plano,
  cacheado por `(messageId, lang)`, mostrado **junto** al original y nunca en su
  lugar. Si el mensaje ya está en el idioma destino, no gasta llamada.
- **Detección de idioma** en el ingest (heurística, coste cero) + relleno
  perezoso al abrir el hilo para el correo histórico, una sola vez por mensaje.
- Aviso de IA en `/ai-disclosure` para ambas funciones (AI Act).
- Degradación: sin `ANTHROPIC_API_KEY` la UI dice «La IA no está configurada en
  este entorno» en lugar de romperse. Verificado en el navegador.

### Bugs encontrados durante el sprint

- **El test de cobertura RLS del P0 cazó la tabla nueva** antes de que me diera
  tiempo a olvidar la política. Funcionó exactamente para lo que se escribió.
- **La detección de idioma acertaba 2 de 5** con textos reales. La primera
  versión puntuaba solo palabras largas y «Perfecto, entonces lo dejamos en 40
  licencias y pago a 30 días» no contiene ninguna → el botón «Traducir» aparecía
  en correos en español, el ruido exacto que la función quería evitar. Rehecha
  con enfoque español-primero por **ratio** de palabras funcionales (incluidas
  las cortas), con marcadores que descartan portugués e italiano. Los cinco
  cuerpos reales son ahora casos de test.
- **Todo el correo histórico tenía `detectedLang` null**, así que el botón se
  mostraba en todo. De ahí el relleno perezoso al leer.
- Un test mío partía de una premisa falsa (creía que «com» empataba español y
  portugués; en realidad es portugués y gana 3-2 legítimamente). Corregido el
  test, no el código.

### Pendiente de verificación

El flujo, la caché, el relleno de idioma y la degradación sin clave están
verificados en el navegador. **La calidad del texto que devuelve el modelo no**:
no hay `ANTHROPIC_API_KEY` en el `.env` local. Añádela (nunca por chat) y se
verifica de punta a punta; coste, céntimos.

## Sprint C — diseño original (~4 días)

Reutiliza `AiService` (`complete`, `callWithTool`, `recordUsage` con coste por
feature). No hace falta infraestructura nueva.

**Resumen del hilo** — `POST /mail/threads/:id/ai/summary`
- Devuelve 3-5 viñetas + «lo que se te pide» + «próximo paso sugerido» + estado
  (esperando respuesta / bloqueado / cerrado).
- **Cache en `EmailThread`**: `aiSummary`, `aiSummaryAt`, `aiSummaryMsgCount`.
  Invalidar solo al entrar un mensaje nuevo. **No es opcional**: el detalle del
  hilo se re-consulta cada 12 s por el poller; sin cache el resumen se
  recalcularía en cada tick y el coste se multiplicaría por ~50.
- Modelo **Haiku** (`ANTHROPIC_FAST_MODEL`): es resumen, no necesita Sonnet.

**Traducir** — `POST /mail/messages/:id/ai/translate { lang }`
- Detección de idioma primero → **el botón solo aparece si el mensaje no está en
  el idioma del usuario**. Un «Traducir» en un correo en español es ruido.
- Traducir el **texto plano, no el HTML**: más barato, sin riesgo de destrozar
  maquetación ni de reinyectar HTML sin sanear.
- Panel plegable **junto al original**, nunca sustituyéndolo — el original
  siempre debe quedar auditable.
- **Cache** en `EmailMessageTranslation (messageId, lang, text)`.
- Casi gratis a partir de aquí: traducir **al escribir** («escribo en español,
  envíalo en inglés») con el mismo endpoint.

---

## Sprint D — IA de escritura: el asistente ✅ HECHO

`typecheck` 8/8 · `lint` 6/6 · `test` **134/134** (17 nuevos).
**Sin cambios de schema** — no hace falta `db push` ni `apply:rls`.

- `POST /mail/threads/:id/ai/draft` (respuesta) y
  `POST /mail/connections/:id/ai/draft` (correo nuevo, propone también asunto).
  Devuelven **dos variantes** con enfoques distintos y etiqueta corta.
- `POST /mail/ai/refine` sobre el texto ya escrito: mejorar · acortar · más
  formal · más cercano · traducir.
- **Contexto inyectado**: hilo (8 mensajes máx.), ficha CRM del contacto
  (lead/cliente, estado, puntuación, oportunidades abiertas con importe y etapa,
  últimas notas) y el `businessInfo`+`faqs` del agente publicado del tenant —
  reutilizado, no duplicado en un segundo sitio que mantener. Todo bajo la regla
  «no inventes precios, plazos ni compromisos».
- Responde en el **idioma en que escribe el contacto** (usa `detectedLang` del
  Sprint C).
- **Nunca envía**: el resultado se carga en el editor. Sonnet, no Haiku: aquí la
  calidad es el producto.
- Rate limit de 20 llamadas/minuto por tenant, coste en `ai_usage`
  (`mail_draft_reply`, `mail_draft_new`, `mail_refine`), y declarado en
  `/ai-disclosure`.
- Salida saneada: se quita el cercado ```html que el modelo añade a veces, se
  pasa por `sanitizeEmailHtml` y se rechaza con 502 si no queda texto útil.

### Bugs encontrados durante el sprint

- **`systemPrompt` recibía `agentKnowledge` y nunca lo usaba.** TypeScript no se
  queja de una propiedad de objeto sin leer, así que el conocimiento de producto
  se recogía de la base y se tiraba: el asistente habría redactado genérico sin
  ningún error visible. Es justo lo que lo diferencia de pegar el hilo en un
  chatbot, así que era el bug más caro del sprint.
- **El typecheck corrigió mis suposiciones sobre el schema**: `Opportunity.name`
  (no `title`) y `PipelineStage.label` (no `name`).
- **El bloque «sobre lo escrito» aparecía con solo la firma en el editor**, así
  que «Mejorar» le habría pasado la firma al modelo, que podía reescribirla.
  Guardado por los dos lados: la UI exige 20 caracteres escritos antes del
  marcador de firma, y el prompt obliga a reproducir el bloque de firma literal.

### Pendiente de verificación

Igual que en el Sprint C: flujo, guardarraíles, saneado, límite de uso y
degradación sin clave están verificados; **la calidad del texto generado no**,
porque no hay `ANTHROPIC_API_KEY` en el `.env` local.

## Sprint D — diseño original (~5 días)

`POST /mail/threads/:id/ai/compose` · `POST /mail/connections/:id/ai/compose`

**Entrada:** una frase del usuario («dile que aceptamos pero necesitamos pago a 30 días»).

**Contexto inyectado** — es lo que diferencia esto de pegar el correo en ChatGPT:
- el hilo completo (o su resumen del Sprint C si es largo),
- ficha CRM del contacto: lead/cliente, estado, oportunidades abiertas e importe, últimas notas,
- `businessInfo` + `faqs` del Agente del tenant — **ya existen**, con el guardarraíl «no inventar»,
- la firma de la conexión y el idioma en que escribe el contacto (responde en su idioma).

**Alcance v1 (decidido): redactar + retocar.**
- Redactar desde cero · Responder al hilo.
- Sobre texto ya escrito: *mejorar* · *acortar* · *más formal* · *más cercano* · *traducir*.
- Tono y longitud configurables; 2-3 variantes para elegir.
- **Siempre cae en el compositor para revisión — nunca envía.**
- Modelo **Sonnet** (aquí sí: es redacción).

**Guardarraíles:** rate-limit por tenant · coste en `ai_usage` con
`feature='mail_compose'` · línea en `/ai-disclosure` (obligación AI Act, la
página ya existe).

*Fuera de v1, backlog:* chips de respuesta rápida al abrir un hilo sin contestar
(3 sugerencias generadas junto al resumen). Descartado de v1 por la llamada extra
por hilo abierto y su interacción con el poller.

---

## Sprint E — deuda: una sola verdad (~3 días)

**E14** — conviven **dos sistemas de correo completos**: `email_connections`
por-bot con poller en `workers`, y `mail_connections` con sync en la API. Si un
tenant conecta el mismo buzón por ambos, se poletea dos veces y se ingiere en dos
modelos. Orden: contar datos en prod → **migrar `Suppression` (obligación legal
RGPD)** → eliminar `EmailConnection` por-bot, el poller de `workers`,
`email-templates`, `campaigns` SMTP directo y el email dentro de `Conversation`.

Va **antes** de la Fase 3 transaccional: no tiene sentido construir encima de dos
sistemas vivos.

---

## Sprint F — endurecer (~3 días)

- **Next.js CVE-2025-66478** — `next@15.1.4` está marcado deprecado por
  vulnerabilidad. Subir a un 15.x parcheado, validando App Router en staging.
- **E7** — cualquier usuario con permiso `mail` puede hacer `PATCH` a
  `visibility: PRIVATE` sobre un buzón SHARED y **reasignarse la propiedad**
  (`mail-connections.service.ts:92-121`), o borrarlo. La lectura sí está
  protegida; la escritura no. Exigir OWNER/ADMIN o `createdByUserId`.
- **E13** — sin `healthcheck` en `api`/`web`/`workers`/`bot-runner` (solo
  postgres y redis): un proceso colgado no se reinicia nunca.
- **E10** — claves de adjunto colisionan con mismo nombre en un mensaje
  (`email/${messageId}/${filename}` se sobrescribe); los objetos `staging/` de R2
  **nunca se borran** (borradores descartados, adjuntos quitados) → fuga de coste.
- **E6** — borradores duplicados: el autosave no tiene guarda de petición en vuelo
  (`mail-composer.tsx:84-116`); si la primera llamada tarda >1,5 s salen dos.
- **E4** — campañas atascadas en `SENDING` para siempre tras un reinicio: el bucle
  vive en el proceso de la API y el `tick()` solo recoge `SCHEDULED`.
- Detección de error de facturación/cuota de Anthropic → «IA no disponible» en UI
  + email al owner (hoy falla en silencio; ya pasó en producción en junio 2026).
- **O10** — test de integración de aislamiento entre tenants: es el único P0 que
  ya ocurrió de verdad y no lo cubre ningún test.
- `/reports/overview` sigue agrupando por estados legacy `['NEW','CONTACTED',
  'QUALIFIED',…]` (`reports.service.ts:4`) cuando el schema migró a
  `LEAD/CLIENT/LOST` → el embudo del home pinta barras vacías.

---

## Backlog (activar con el 3.er cliente, no antes)

- **O3** índices: `Lead.email`/`Client.email` (ILIKE sin índice en cada correo
  entrante **y** en cada apertura de hilo, que se repite cada 12 s por el
  poller) · `pg_trgm` para la búsqueda (`text contains` = seq scan) ·
  `[connectionId, subject]` para el threading por asunto.
- **O2** los 5 pollers simultáneos de la bandeja (~18 req/min/usuario en reposo,
  siguen corriendo con la pestaña oculta) → pausar con `visibilityState`,
  consolidar en `GET /mail/state`, contadores en Redis, y a futuro SSE.
- **O1** una transacción por request: `withTenant` abre una transacción
  interactiva por llamada y los servicios hacen 3-6 seguidas (`getThread` = 4,
  `reply` = 6). Con `connection_limit=5` el pool satura con pocos usuarios.
- **O7** los tres schedulers (mail sync, campañas, alertas) viven dentro de
  `cfai-api` → **impide escalar la API horizontalmente** (dos réplicas = doble
  poll IMAP y doble envío). Mover a `apps/workers` + BullMQ, que existe casi vacío.
- **O5** prompt caching de Anthropic (`cache_control` en el bloque
  systemPrompt+businessInfo+faqs de los agentes): ~90 % menos coste de entrada.
- **O9** retención: `user_session` caducadas nunca se purgan; `email_messages`
  (con HTML completo), `messages`, `ai_usage` y `access_log` crecen sin límite en
  el mismo disco que ya dio un incidente.
- **O8** IMAP IDLE en lugar de reconectar cada 90 s por buzón (con 50 buzones son
  33 logins/min y varios proveedores hacen throttling; además `take: 100` corta
  en silencio).
- **O5b** `PRICING` es un mapa hardcodeado: si cambia `ANTHROPIC_DEFAULT_MODEL`,
  el coste registrado pasa a **0 en silencio**. Fallback ruidoso.
- Fase 3 transaccional · Fase 4 campañas con ESP + dominio verificado por tenant ·
  WhatsApp Cloud API.

---

## Fuera de código — con plazos externos, empezar ya

1. **Verificación de la app de Google.** Los scopes `calendar.events`/`freebusy`
   son «sensibles» y la app está en modo *Testing*: solo usuarios de prueba
   pueden conectar. La verificación tarda semanas → sin ella los pilotos no
   pueden conectar su calendario.
2. **Auto-reload de saldo en Anthropic.** Sin saldo, TODA la IA falla en silencio.
3. Capacitación 20 h + diploma (Kit Digital req. #18).

---

## Coste de IA

Con Haiku en resumen/traducción, Sonnet solo en redacción y las dos cachés, un
usuario intensivo (~80 correos/día, resumen en la mitad, 10 redacciones) sale por
**céntimos al día**. Sin las cachés el resumen se recalcula en cada poll de 12 s
y el coste se multiplica por ~50. **La cache es parte del diseño, no una
optimización posterior.**
