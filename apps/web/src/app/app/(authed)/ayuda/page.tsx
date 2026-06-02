import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/primitives';

export const metadata = { title: 'Centro de Ayuda · Converflow' };

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: 'primeros-pasos', title: 'Primeros pasos' },
  { id: 'agentes', title: 'Crear un agente' },
  { id: 'bots', title: 'Conectar un bot (canales)' },
  { id: 'importar', title: 'Importar leads desde CSV' },
  { id: 'score-ia', title: 'Puntuar leads con IA' },
  { id: 'oportunidades', title: 'Oportunidades y pipelines' },
  { id: 'campos', title: 'Campos personalizados' },
  { id: 'usuarios', title: 'Usuarios y permisos' },
  { id: 'faq', title: 'Preguntas frecuentes' },
  { id: 'aviso-ia', title: 'Aviso IA y Privacidad' },
];

/**
 * In-app help center. One page, anchored sections, sticky TOC on the side.
 * Purpose: in-product documentation (Kit Digital evidence) + day-to-day
 * onboarding for new tenants. Plain-language, screenshot-friendly.
 */
export default function HelpCenterPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Centro de Ayuda"
        description={
          <>
            Guías, instrucciones de uso y documentación de Converflow. Si no
            encuentras lo que buscas, escríbenos a{' '}
            <a href="mailto:soporte@converflow.ai" className="text-primary-700 hover:underline">
              soporte@converflow.ai
            </a>
            .
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        {/* Sticky TOC */}
        <aside className="md:sticky md:top-4 md:self-start">
          <nav aria-label="Índice del centro de ayuda" className="rounded-md border border-ink-100 bg-white p-3 text-sm">
            <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-ink-500">
              Contenidos
            </div>
            <ol className="space-y-1">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded px-2 py-1 text-ink-700 hover:bg-ink-100 hover:text-ink-900"
                  >
                    <span className="mr-1 font-mono text-[10px] text-ink-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        {/* Sections */}
        <div className="space-y-6">
          <Section id="primeros-pasos" title="Primeros pasos">
            <p>
              Converflow es una plataforma de <strong>gestión de clientes con asistentes
              de IA</strong> multitenant. Cada cuenta tiene sus propios leads, bots,
              conversaciones, oportunidades y campos personalizados, totalmente aislados.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <strong>Completa tu perfil</strong> en{' '}
                <Link href="/app/profile" className="text-primary-700 hover:underline">
                  Perfil
                </Link>{' '}
                (nombre, email, cambio de contraseña si era temporal).
              </li>
              <li>
                <strong>Crea tu primer agente</strong> en{' '}
                <Link href="/app/agents/new" className="text-primary-700 hover:underline">
                  Agentes → Nuevo
                </Link>{' '}
                eligiendo la plantilla que más se parezca a tu caso (conversacional,
                puntuación de leads, etc.).
              </li>
              <li>
                <strong>Conecta un canal</strong> (Email, WhatsApp o WebChat) en{' '}
                <Link href="/app/bots" className="text-primary-700 hover:underline">
                  Bots
                </Link>{' '}
                y asocia el agente que has creado.
              </li>
              <li>
                <strong>Importa tus leads</strong> desde un CSV (o déjalos llegar
                automáticamente desde los canales).
              </li>
            </ol>
            <p className="text-xs text-ink-500">
              Tip: en la página de Inicio tienes una checklist con estos pasos para
              guiarte la primera vez.
            </p>
          </Section>

          <Section id="agentes" title="Crear un agente">
            <p>
              Un <strong>agente</strong> es la pieza de IA que decide qué hacer con un lead
              o una conversación. En Converflow hay tres tipos de motor:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Conversacional.</strong> Responde a clientes en chat (Email,
                WhatsApp, WebChat). Tiene tono, idioma, información de la empresa y un
                aviso de IA configurable.
              </li>
              <li>
                <strong>Oportunidades.</strong> Lee un lead (con sus campos) y le pone un
                score 0–100; opcionalmente actualiza estado (Lead / Cliente / Perdido) y
                abre oportunidades en el tablero.
              </li>
              <li>
                <strong>Utilidad.</strong> Reservado para flujos próximos (triaje, agenda,
                etc.).
              </li>
            </ul>
            <p>
              En{' '}
              <Link href="/app/agents/new" className="text-primary-700 hover:underline">
                Agentes → Nuevo
              </Link>{' '}
              elige primero una <strong>plantilla del embudo</strong> (Calificar / Vender
              / Fidelizar). El formulario se prerrellena con un buen punto de partida
              que después puedes cambiar entero.
            </p>
          </Section>

          <Section id="bots" title="Conectar un bot (Email, WhatsApp, WebChat)">
            <p>
              Un <strong>bot</strong> es el canal por el que el agente habla con el cliente
              final. Cada bot tiene su <strong>modo de respuesta</strong>:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Sugerir.</strong> El agente propone respuestas, las envía un humano
                (recomendado para empezar y en sectores delicados).
              </li>
              <li>
                <strong>Auto.</strong> El agente responde solo, sin intervención humana.
              </li>
              <li>
                <strong>Apagado.</strong> El bot recibe mensajes pero no contesta.
              </li>
            </ul>
            <p>
              Canales disponibles:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>WebChat embebido.</strong> En{' '}
                <Link href="/app/bots" className="text-primary-700 hover:underline">
                  Bots
                </Link>{' '}
                creas un bot tipo WebChat y copias el snippet en tu web. El widget pide
                nombre + email y muestra siempre el aviso "Asistente de IA · puede cometer
                errores".
              </li>
              <li>
                <strong>WhatsApp.</strong> Por integración con el dispositivo del usuario
                (QR). Las conversaciones aparecen en{' '}
                <Link href="/app/conversations" className="text-primary-700 hover:underline">
                  Conversaciones
                </Link>
                .
              </li>
              <li>
                <strong>Email.</strong> El bot lee y responde correos en una cuenta
                conectada.
              </li>
            </ul>
          </Section>

          <Section id="importar" title="Importar leads desde CSV">
            <p>
              En{' '}
              <Link href="/app/leads/import" className="text-primary-700 hover:underline">
                Leads → Importar
              </Link>{' '}
              puedes subir un CSV con tus contactos.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                El parser detecta automáticamente separador (<code>,</code> o <code>;</code>),
                BOM y comillas.
              </li>
              <li>
                Mapeas columnas a campos estándar (<em>Nombre, Apellido, Email, Teléfono,
                Fuente, Estado</em>) o a tus campos personalizados.
              </li>
              <li>
                Los teléfonos sin prefijo internacional se completan con +34 si activas
                el toggle.
              </li>
              <li>
                Fechas en formato <code>DD/MM/YYYY</code> son válidas en campos personalizados
                de tipo fecha.
              </li>
              <li>
                Cada lead requiere <strong>email o teléfono</strong>. Las filas que fallen se
                muestran inline y puedes editarlas antes de reintentar.
              </li>
            </ul>
          </Section>

          <Section id="score-ia" title="Puntuar leads con IA">
            <p>
              Desde{' '}
              <Link href="/app/leads" className="text-primary-700 hover:underline">
                Leads
              </Link>{' '}
              puedes lanzar la puntuación con IA, tanto individual como masiva.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Score IA en masa.</strong> El botón "Score IA en masa" abre un
                modal que muestra cuántos leads se van a puntuar, qué agente de
                Oportunidades se usa y si actualizar estado / crear oportunidades.
              </li>
              <li>
                <strong>Procesamiento asíncrono.</strong> El batch se ejecuta en background.
                Puedes cerrar el modal y volver más tarde; verás el progreso real, el
                tiempo estimado y los errores por lead.
              </li>
              <li>
                <strong>Aviso de IA.</strong> Cada lead puntuado lleva una etiqueta "Score
                IA" con el timestamp. Los resultados son una <em>recomendación</em>:
                revísalos antes de actuar.
              </li>
            </ul>
          </Section>

          <Section id="oportunidades" title="Oportunidades y pipelines">
            <p>
              Las oportunidades son ventas/operaciones en curso asociadas a un lead. Se
              gestionan en un Kanban con etapas personalizables por tablero (pipeline).
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Configura tus pipelines y etapas en{' '}
                <Link href="/app/settings/pipelines" className="text-primary-700 hover:underline">
                  Configuración → Tableros
                </Link>
                .
              </li>
              <li>
                Crea oportunidades a mano desde el detalle de un lead, o deja que el
                agente de Oportunidades las abra automáticamente cuando detecte interés.
              </li>
              <li>
                Cada movimiento de etapa queda registrado en el historial con quién y
                cuándo.
              </li>
            </ul>
          </Section>

          <Section id="campos" title="Campos personalizados">
            <p>
              Puedes ampliar el modelo de datos de leads, clientes y oportunidades sin
              tocar código.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                En{' '}
                <Link href="/app/settings/fields" className="text-primary-700 hover:underline">
                  Configuración → Campos personalizados
                </Link>{' '}
                creas campos de tipo texto, número, fecha, selección, sí/no, etc.
              </li>
              <li>
                Los campos aparecen automáticamente en el formulario de creación y
                detalle, en el importador CSV y en el contexto que recibe la IA.
              </li>
              <li>
                Reordena los campos con las flechas ▲▼ para ajustar el orden de
                presentación.
              </li>
              <li>
                Leads y Clientes comparten el mismo conjunto de campos personalizados.
              </li>
            </ul>
          </Section>

          <Section id="usuarios" title="Usuarios y permisos">
            <p>
              Converflow permite invitar a tu equipo y controlar con detalle a qué partes
              del producto tiene acceso cada persona. La gestión vive en{' '}
              <Link href="/app/users" className="text-primary-700 hover:underline">
                Configuración → Usuarios
              </Link>{' '}
              y solo está disponible para usuarios con el permiso{' '}
              <code>Gestionar usuarios</code> (por defecto: Propietario y Administrador).
            </p>

            <h3>Roles disponibles</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Propietario</strong> — control total. Siempre tiene acceso a todos
                los módulos; sus permisos no se pueden limitar.
              </li>
              <li>
                <strong>Administrador</strong> — gestión completa del tenant: usuarios,
                configuración, importaciones, IA, todo.
              </li>
              <li>
                <strong>Constructor</strong> — diseña los agentes y los bots, opera con
                leads y conversaciones; no entra a Configuración ni a importaciones de CSV
                por defecto.
              </li>
              <li>
                <strong>Agente</strong> — uso operativo: ver y editar leads/clientes/
                oportunidades y atender la bandeja de conversaciones. Por defecto no puede
                crear agentes, bots ni importar datos.
              </li>
            </ul>

            <h3>Permisos por rol (valores por defecto)</h3>
            <table>
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Propietario</th>
                  <th>Admin</th>
                  <th>Constructor</th>
                  <th>Agente</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>CRM (leads, clientes, oportunidades, tareas)</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Conversaciones</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Documentos</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Agentes (crear, editar, publicar)</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Bots (canales y conexiones)</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Score IA en masa</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Importar leads (CSV)</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Configuración (campos, tableros)</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Gestionar usuarios</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-ink-500">
              ✓ Permitido por defecto · — No permitido por defecto. Los Propietarios
              tienen siempre acceso completo y no se les pueden quitar permisos.
            </p>

            <h3>Invitar un usuario</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Ve a{' '}
                <Link href="/app/users/new" className="text-primary-700 hover:underline">
                  Configuración → Usuarios → Invitar usuario
                </Link>
                .
              </li>
              <li>Introduce email y nombre.</li>
              <li>
                Elige el rol. Al cambiar el rol, los permisos por defecto se actualizan
                automáticamente.
              </li>
              <li>
                (Opcional) Activa la opción <strong>Personalizar</strong> para marcar o
                desmarcar módulos uno a uno. Los módulos que vienen del rol llevan una
                etiqueta <code>por rol</code> para ayudarte a distinguirlos.
              </li>
              <li>
                Al pulsar <strong>Crear usuario</strong> se genera una contraseña temporal
                única. Cópiala y compártesela al nuevo usuario por un canal seguro.
              </li>
              <li>
                Cuando el nuevo usuario inicie sesión, la plataforma le pedirá cambiar la
                contraseña antes de continuar.
              </li>
            </ol>

            <h3>Editar el rol o los permisos de un usuario</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                En la tabla de Usuarios, pulsa <strong>Editar</strong> en la fila del
                usuario.
              </li>
              <li>Cambia el rol o el estado (Activo / Pendiente / Suspendido).</li>
              <li>
                Marca <strong>Personalizar</strong> para definir un conjunto explícito de
                permisos diferente al del rol. Si no marcas la casilla, el usuario seguirá
                los valores por defecto del rol que tenga asignado.
              </li>
              <li>
                Guarda. Los cambios se aplican en la siguiente petición que haga el
                usuario; si está logueado, se le bloquearán inmediatamente las acciones que
                ya no tiene permitidas.
              </li>
            </ol>
            <p className="text-xs text-ink-500">
              Aviso: el rol <strong>Propietario</strong> no admite restricciones. Si lo
              asignas a un usuario, sus permisos se restablecen a acceso completo aunque
              hubieran sido personalizados previamente. Esto es deliberado para evitar
              quedarte sin un propietario válido en tu cuenta.
            </p>

            <h3>Cómo afectan los permisos a la interfaz</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Los <strong>elementos del menú lateral</strong> se ocultan automáticamente
                si el usuario no tiene acceso al módulo correspondiente.
              </li>
              <li>
                Los <strong>botones contextuales</strong> (por ejemplo &quot;Importar
                CSV&quot; o &quot;Score IA en masa&quot;) desaparecen para los usuarios
                que no tienen el permiso.
              </li>
              <li>
                Si un usuario entra a una URL directa para la que no tiene permiso, el
                servidor responderá con un mensaje claro (&quot;Tu rol no incluye el
                permiso X. Pide al propietario que lo habilite.&quot;).
              </li>
              <li>
                La aplicación de los permisos se hace tanto en el cliente como en el
                servidor; no es posible saltarse las restricciones por inspección de la
                interfaz.
              </li>
            </ul>

            <h3>Eliminar un usuario</h3>
            <p>
              Desde la tabla de Usuarios, pulsa <strong>Eliminar</strong>. Se pedirá
              confirmación. El usuario pierde acceso inmediatamente y sus sesiones se
              invalidan en la siguiente petición. No se elimina el rastro de auditoría: las
              acciones que ya hubiera realizado siguen registradas en el log de accesos.
            </p>
            <p className="text-xs text-ink-500">
              No es posible eliminar al único propietario que tenga la cuenta — primero
              asciende a otro usuario al rol de Propietario.
            </p>
          </Section>

          <Section id="faq" title="Preguntas frecuentes">
            <dl className="space-y-4">
              <FaqItem
                q="¿Mis datos están aislados del resto de cuentas?"
                a="Sí. Converflow es multitenant con aislamiento estricto por tenant a nivel de base de datos (Row-Level Security). Ningún usuario de otra cuenta puede ver tus leads, conversaciones o agentes."
              />
              <FaqItem
                q="¿Qué modelos de IA usa Converflow?"
                a="Converflow usa modelos de lenguaje proporcionados por proveedores externos (ver Aviso IA). Tus datos se procesan bajo acuerdos de tratamiento de datos y no se usan para reentrenar modelos."
              />
              <FaqItem
                q="¿Puedo modificar las respuestas que propone la IA antes de enviarlas?"
                a="Sí. En modo Sugerir, todas las respuestas pasan por revisión humana antes de enviarse. Puedes editarlas, copiarlas o descartarlas."
              />
              <FaqItem
                q="¿Cómo paso una conversación de la IA a una persona?"
                a="Desde la bandeja de Conversaciones, simplemente responde tú directamente: la IA dejará de auto-responder en esa conversación hasta que cambies el bot a modo Auto otra vez."
              />
              <FaqItem
                q="¿Cómo se avisa al cliente final de que está hablando con una IA?"
                a="El widget de WebChat muestra siempre 'Asistente de IA · puede cometer errores'. En los agentes conversacionales, el campo 'Aviso de IA' configura el texto que se inyecta al inicio de cada conversación nueva."
              />
              <FaqItem
                q="¿Cómo borro mis datos o exporto la información?"
                a="Escríbenos a soporte@converflow.ai. Como responsables del tratamiento, gestionamos tus solicitudes de acceso, rectificación, supresión y portabilidad conforme al RGPD."
              />
              <FaqItem
                q="¿Puedo dar acceso solo a ciertas partes del producto a alguien de mi equipo?"
                a="Sí. Cada usuario hereda los permisos por defecto de su rol, pero el propietario puede personalizar módulos concretos: marca 'Personalizar' al invitar o editar y activa/desactiva los checkboxes (CRM, Conversaciones, Documentos, Agentes, Bots, Score IA, Importar, Configuración, Gestionar usuarios)."
              />
              <FaqItem
                q="¿Por qué no me aparece el menú de Configuración en mi cuenta?"
                a="Probablemente tu usuario no tiene los permisos 'Configuración' ni 'Gestionar usuarios'. Pide al propietario que los habilite desde Configuración → Usuarios → Editar."
              />
            </dl>
          </Section>

          <Section id="aviso-ia" title="Aviso IA y Privacidad">
            <p>
              Converflow cumple con la normativa europea sobre transparencia en sistemas
              de IA. Consulta:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <Link href="/ai-disclosure" target="_blank" className="text-primary-700 hover:underline">
                  Aviso de uso de IA
                </Link>{' '}
                — modelos utilizados, finalidad, derechos del usuario y referencias al
                Reglamento Europeo de IA.
              </li>
              <li>
                <Link href="/privacy" target="_blank" className="text-primary-700 hover:underline">
                  Política de privacidad
                </Link>{' '}
                — tratamiento de datos personales, base legal, encargados y derechos
                RGPD.
              </li>
              <li>
                <Link href="/changelog" target="_blank" className="text-primary-700 hover:underline">
                  Changelog
                </Link>{' '}
                — historial de cambios del producto.
              </li>
            </ul>
            <p className="text-xs text-ink-500">
              Para dudas sobre cumplimiento, escribe a{' '}
              <a href="mailto:legal@converflow.ai" className="text-primary-700 hover:underline">
                legal@converflow.ai
              </a>
              .
            </p>
          </Section>

          <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 text-sm text-ink-600">
            ¿No has encontrado lo que buscabas? Escríbenos a{' '}
            <a href="mailto:soporte@converflow.ai" className="text-primary-700 hover:underline">
              soporte@converflow.ai
            </a>{' '}
            y te ayudamos. Tiempo medio de respuesta: 1 día hábil.
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card>
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
        <div className="mt-3 space-y-3 text-sm text-ink-700">{children}</div>
      </Card>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-medium text-ink-900">{q}</dt>
      <dd className="mt-1 text-ink-700">{a}</dd>
    </div>
  );
}
