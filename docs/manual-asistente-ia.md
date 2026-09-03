# Manual de uso — El Asistente de Converflow

> Para administradores y equipos de un tenant. Explica cómo poner el Asistente
> a trabajar: qué sabe, por dónde atiende, cómo se controla y dónde se ve lo
> que hace. Última actualización: septiembre de 2026.

## Qué es

Cada cuenta tiene **un único Asistente**. Aprende del conocimiento que le das,
consulta la ficha CRM del contacto antes de responder, y atiende en todos los
canales conectados: correo, WhatsApp y chat web. Tú decides, canal a canal, si
está apagado, si **sugiere** respuestas para que las revise una persona, o si
**responde solo**.

## Puesta en marcha (15 minutos)

### 1. Aliméntalo — Conocimiento (`/app/knowledge`)

- **Fuentes**: sube documentos (PDF, texto) o añade URLs. El Asistente solo
  responde con lo que hay aquí: no inventa precios, plazos ni condiciones.
- **Instrucciones**: reglas de la casa («nunca prometas descuentos», «las
  visitas se agendan solo por la mañana»).
- **Verificadas**: respuestas aprobadas por tu equipo. Tienen prioridad sobre
  cualquier documento.
- **Identidad**: tono (formal/cercano) e idioma por defecto.
- **Probador**: haz preguntas de prueba y ve qué respondería, con las fuentes
  que usó, sin gastar mensajes reales.

### 2. Actívalo por canal

- **Correo** — `Correo → Ajustes` (`/app/mail/ajustes`): columna **Asistente**
  de cada buzón → `Apagada` / `Sugiere` / `Responde sola`. Recomendado:
  empezar con **Sugiere**.
- **Bots (WhatsApp / chat web)** — en la configuración de cada bot, el mismo
  selector de modo.

> ⚠️ **Interruptor general**: en `Configuración → IA y automatización` existe
> «Análisis automático de mensajes entrantes». Si está desactivado, el
> Asistente **no propondrá nada en ningún canal**, aunque cada buzón o bot
> tenga su modo activado. Ahí mismo se fija el límite mensual de uso de IA.

### 3. Reparte el trabajo — Reglas de asignación

En `Correo → Ajustes → Reglas de asignación`: «si el correo contiene
*factura* → asignar a María», por bandeja o para todas, con dominio del
remitente opcional. La primera regla que casa gana. La misma tabla de reglas
funciona para los canales de bots. La persona asignada recibe una tarea y el
hilo le aparece como no leído.

## El día a día en el correo

### Modo «Sugiere»

Cuando entra un correo, el Asistente prepara la respuesta y la deja como
**borrador** en el hilo:

- En la **lista de hilos**, una **chispa verde ✨** marca los hilos con
  respuesta preparada.
- Al abrir el hilo, un **banner verde** lo anuncia y el compositor se abre con
  el texto listo (destinatario y asunto incluidos). Revisas, tocas lo que
  quieras y **Enviar**.
- Si el borrador llega mientras ya tienes el hilo abierto, aparece el botón
  «Ver la respuesta propuesta» — nunca pisa lo que estés escribiendo.

### Modo «Responde sola»

Si el Asistente **tiene la respuesta** en el Conocimiento, contesta él mismo
(el mensaje queda marcado como «✨ Asistente») y el hilo pasa a **Pendiente**
(esperando al cliente). Si el cliente reabre, vuelve a Abierto. Cerrar un
hilo es siempre decisión humana.

Si **no tiene la respuesta**, no envía nada: deja borrador, el hilo queda
Abierto para el equipo y la duda se registra como **laguna** en el
Conocimiento (con el cliente esperando señalado).

Protecciones siempre activas: no responde a correos automáticos (no-reply,
auto-replies), máximo 3 respuestas por hilo cada 24 h, y si una persona del
equipo está atendiendo el hilo (lo tiene abierto o respondió hace poco), el
Asistente se aparta y solo sugiere.

### Botón «Proponer respuesta» (en cualquier momento)

En el compositor de una respuesta: **Proponer respuesta** hace que el
Asistente redacte con el Conocimiento y la ficha del cliente — lo mismo que
haría solo, pero bajo demanda. Funciona aunque el buzón esté en `Apagada`.
Si no encuentra la respuesta en el Conocimiento te lo avisa y registra la
laguna. En «Más opciones de redacción» sigue el asistente de escritura
clásico: dile qué contestar, elige tono y longitud, mejora o traduce lo que
ya escribiste.

## Seguimiento del valor

- **Inicio → widget «Pulso del Asistente»**: conversaciones atendidas,
  correos respondidos solos, reuniones agendadas, escaladas — y accesos
  directos a lo que espera revisión humana (lagunas, playbooks, sugerencias).
- **Lagunas** (`Conocimiento → Lagunas`): preguntas que el Asistente no supo
  responder, agrupadas. Responder una laguna la convierte en conocimiento y,
  si había un cliente esperando, te lo señala.
- Cuando una persona corrige una respuesta del Asistente antes de enviarla,
  esa corrección se convierte en **respuesta verificada**: el Asistente
  mejora con el uso.
- **Informe mensual** con la actividad y los temas más consultados.

## Si «no propone nada» — lista de comprobación

1. `Configuración → IA y automatización` → «Análisis automático de mensajes
   entrantes» **activado** (si está apagado, Ajustes de Correo lo avisa con un
   banner ámbar) y límite mensual no agotado.
2. `Correo → Ajustes` → el buzón concreto en `Sugiere` o `Responde sola`
   (por defecto nace en `Apagada`).
3. ¿El correo era de un remitente automático (no-reply, notificaciones)? Esos
   se ignoran a propósito.
4. ¿Alguien del equipo tenía el hilo abierto en ese momento? El Asistente no
   interrumpe.
5. Para el detalle técnico: los logs del servidor registran el motivo exacto
   de cada salto («auto-respuesta saltada: …»).

## Privacidad y control

- El Asistente solo usa datos del propio tenant (aislamiento por cuenta a
  nivel de base de datos).
- Nunca inventa: sin dato en el Conocimiento, escala o deja constancia de que
  se confirmará.
- Consentimientos quedan registrados con el texto exacto mostrado.
- Todo el gasto de IA queda contabilizado y limitado por el tope mensual que
  fije el administrador.
