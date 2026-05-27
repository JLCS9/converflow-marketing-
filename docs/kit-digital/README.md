# Kit Digital compliance

The platform targets two Kit Digital categories:

1. **Gestión de Procesos con IA asociada** (Red.es category G_IA)
2. **Gestión de Clientes con IA asociada** (Red.es category C_IA)

This folder collects evidence material and tracks which requirements
are already satisfied by the platform vs. still pending.

## Status snapshot

| Requirement | Source | Where it lives | Status |
|---|---|---|---|
| Logs de acceso por usuario en BD, exportables | G_IA §2.1.6.2, C_IA §17 | `access_logs` table + `/access-logs/export.csv` endpoint | ✅ baseline |
| Usuarios suministrados (20 / 25 por segmento) | G_IA §2.1.4.1, C_IA §1 | `Tenant.maxUsers` + `kitDigitalSegment` | ✅ baseline |
| Sistema actualizable con historial visible | G_IA §2.1.4.5, C_IA §16 | `app_versions` table + `/changelog` page | 🟡 schema only |
| Aviso de uso de IA (AI Act) | C_IA §16 | banner in `/app/*` + `/ai-disclosure` page | 🟡 placeholder |
| Datos, privacidad, seguridad (RGPD + AI Act) | C_IA §15 | `/privacy` page + DPA template | ⏳ pending |
| Web responsive 3 dispositivos | C_IA §9 | Tailwind layouts + Playwright screenshots | ⏳ pending |
| Integración con plataformas (API/WS/ficheros) | both | NestJS REST API + OpenAPI docs | ✅ baseline |
| Lead scoring predictivo IA | C_IA §11 | `agents` + LLM scoring worker | ⏳ Fase 4 |
| Automatización reuniones | C_IA §12 | Google Calendar integration | ⏳ Fase 4 |
| Automatización journeys de venta | C_IA §13 | agent workflows | ⏳ Fase 4 |
| Capacitación 20h + diploma | both | `/academy` module | ⏳ Fase 6 |
| Hardware (opcional) | both | N/A — software only | N/A |

Legend: ✅ baseline = schema + endpoint exist · 🟡 placeholder = stub
present, needs UI · ⏳ pending = not started.

## Evidence collection

Once the corresponding feature is built, capture screenshots into this
folder under `evidence/<requirement-slug>/` following Red.es naming
conventions. Use the templates from the Red.es Kit Digital portal.
