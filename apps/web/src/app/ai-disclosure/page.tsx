import Link from 'next/link';

export const metadata = {
  title: 'Uso de Inteligencia Artificial · converflow.ai',
  description:
    'Información de transparencia sobre el uso de sistemas de IA en Converflow conforme al Reglamento (UE) 2024/1689 (AI Act) y al RGPD.',
};

const LAST_UPDATE = '2 de junio de 2026';

interface TocItem {
  id: string;
  title: string;
}

const TOC: TocItem[] = [
  { id: 'resumen', title: 'Resumen' },
  { id: 'marco', title: '1. Marco normativo aplicable' },
  { id: 'sistemas', title: '2. Sistemas de IA utilizados' },
  { id: 'riesgo', title: '3. Categorización de riesgo conforme al AI Act' },
  { id: 'transparencia', title: '4. Aviso al usuario y transparencia' },
  { id: 'datos-ia', title: '5. Datos procesados por la IA' },
  { id: 'proveedores', title: '6. Proveedores y transferencias' },
  { id: 'humano', title: '7. Intervención humana y supervisión' },
  { id: 'limitaciones', title: '8. Limitaciones y riesgos' },
  { id: 'prohibidos', title: '9. Casos de uso prohibidos' },
  { id: 'gobernanza', title: '10. Gobernanza interna y registros' },
  { id: 'derechos', title: '11. Derechos del interesado' },
  { id: 'contacto', title: '12. Contacto y reclamaciones' },
];

/**
 * Public AI use disclosure aligned with:
 *  - Reglamento (UE) 2024/1689, AI Act
 *  - Reglamento (UE) 2016/679, RGPD (especialmente arts. 13, 14, 22)
 *  - Programa Kit Digital: obligaciones de transparencia de la categoría
 *    "Gestión de clientes con IA" (Asistente Digital Avanzado, ADA).
 */
export default function AiDisclosurePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← Volver a converflow.ai
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Uso de Inteligencia Artificial
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        Versión vigente desde el {LAST_UPDATE}. Documento de transparencia conforme al
        Reglamento (UE) 2024/1689 sobre inteligencia artificial (<em>AI Act</em>) y al
        Reglamento (UE) 2016/679 (RGPD).
      </p>

      {/* TOC */}
      <nav
        aria-label="Índice del documento"
        className="mt-8 rounded-lg border border-ink-100 bg-ink-100/30 p-5 text-sm"
      >
        <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-ink-500">
          Índice
        </div>
        <ol className="grid gap-1 sm:grid-cols-2">
          {TOC.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="text-primary-700 hover:underline">
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="prose prose-ink mt-10 max-w-none space-y-6 text-ink-700">
        {/* Resumen */}
        <section id="resumen" className="scroll-mt-6">
          <h2>Resumen ejecutivo</h2>
          <table>
            <tbody>
              <tr>
                <th>Proveedor del servicio</th>
                <td>
                  <strong>CONVERFLOW SL</strong> · NIF B19934371 · Calle Playa de Calafell
                  9, 28290 Las Rozas de Madrid (España).
                </td>
              </tr>
              <tr>
                <th>Naturaleza del sistema</th>
                <td>
                  Plataforma SaaS de gestión comercial que integra componentes de IA
                  generativa y de clasificación.
                </td>
              </tr>
              <tr>
                <th>Categorización AI Act</th>
                <td>
                  Sistema de <strong>riesgo limitado</strong> con obligaciones de
                  transparencia (artículo 50). No incluye usos prohibidos (artículo 5) ni
                  de alto riesgo (Anexo III).
                </td>
              </tr>
              <tr>
                <th>Transparencia</th>
                <td>
                  Aviso visible al usuario final en todas las interacciones generadas por
                  IA y etiquetado del contenido generado por IA en el panel.
                </td>
              </tr>
              <tr>
                <th>Intervención humana</th>
                <td>
                  Por defecto, las funcionalidades de IA operan en modo de sugerencia con
                  revisión humana. El modo automático es opt-in y reversible en todo
                  momento.
                </td>
              </tr>
              <tr>
                <th>Datos para entrenamiento</th>
                <td>
                  Los datos de los clientes <strong>no se utilizan</strong> para entrenar o
                  reentrenar los modelos de los proveedores.
                </td>
              </tr>
              <tr>
                <th>Reclamaciones</th>
                <td>
                  <a href="mailto:privacidad@converflow.ai">privacidad@converflow.ai</a> y,
                  respecto al AI Act, la futura autoridad nacional competente designada
                  conforme al artículo 70 del Reglamento.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 1. Marco normativo */}
        <section id="marco" className="scroll-mt-6">
          <h2>1. Marco normativo aplicable</h2>
          <p>
            El presente documento da cumplimiento a las obligaciones de transparencia e
            información derivadas de:
          </p>
          <ul>
            <li>
              <strong>Reglamento (UE) 2024/1689</strong> del Parlamento Europeo y del
              Consejo, de 13 de junio de 2024, por el que se establecen normas armonizadas
              en materia de inteligencia artificial (<em>AI Act</em>), en particular sus
              artículos 50 (transparencia) y 95 (códigos de conducta).
            </li>
            <li>
              <strong>Reglamento (UE) 2016/679</strong> (RGPD), en particular sus artículos
              13, 14 y 22 (información en la recogida de datos y decisiones individuales
              automatizadas).
            </li>
            <li>
              <strong>Ley Orgánica 3/2018</strong>, de 5 de diciembre, de Protección de
              Datos Personales y garantía de los derechos digitales (LOPDGDD).
            </li>
            <li>
              <strong>Directrices del Comité Europeo de Protección de Datos</strong>{' '}
              aplicables a la transparencia y al tratamiento mediante sistemas de IA.
            </li>
            <li>
              <strong>Bases reguladoras del programa Kit Digital</strong> (categoría
              <em> Gestión de clientes con IA / Asistente Digital Avanzado</em>) en lo
              relativo a la transparencia del uso de IA y la puesta a disposición de
              documentación técnica y de usuario.
            </li>
          </ul>
        </section>

        {/* 2. Sistemas */}
        <section id="sistemas" className="scroll-mt-6">
          <h2>2. Sistemas de IA utilizados</h2>
          <p>
            CONVERFLOW SL integra modelos de lenguaje de gran tamaño (<em>Large Language
            Models</em>) y sistemas auxiliares de clasificación proporcionados por
            terceros, a través de interfaces de programación (API). Las siguientes
            funcionalidades hacen uso de IA:
          </p>
          <ul>
            <li>
              <strong>Asistente conversacional.</strong> Genera respuestas en chats con
              clientes finales (WhatsApp, correo electrónico, web chat embebido).
            </li>
            <li>
              <strong>Clasificación de mensajes.</strong> Identifica la intención (interés
              de compra, objeción, queja, solicitud de información, etc.) y el sentimiento
              de los mensajes entrantes.
            </li>
            <li>
              <strong>Puntuación de oportunidades (lead scoring).</strong> Asigna una
              puntuación de 0 a 100 a cada contacto en función de la información disponible
              y de las reglas configuradas por el usuario.
            </li>
            <li>
              <strong>Sugerencia de respuestas y resúmenes.</strong> Propone respuestas o
              resúmenes que el usuario revisa antes de enviar o aceptar.
            </li>
          </ul>
          <p>
            CONVERFLOW SL no entrena modelos fundacionales propios. Actúa como{' '}
            <strong>responsable del despliegue</strong> (<em>deployer</em>, art. 3.4 AI
            Act) integrando modelos de propósito general puestos a disposición por sus
            proveedores y aplicando capas propias de prompting, validación y enrutamiento.
          </p>
        </section>

        {/* 3. Categorización */}
        <section id="riesgo" className="scroll-mt-6">
          <h2>3. Categorización de riesgo conforme al AI Act</h2>
          <p>
            Tras un análisis pormenorizado de los usos descritos, CONVERFLOW SL clasifica
            su sistema como de <strong>riesgo limitado</strong> a efectos del AI Act, con
            las consiguientes obligaciones reforzadas de transparencia previstas en el
            artículo 50 del Reglamento. En particular:
          </p>
          <ul>
            <li>
              <strong>No se incurre en prácticas prohibidas</strong> del artículo 5 (no se
              emplean técnicas subliminales, no se aprovechan vulnerabilidades de grupos
              específicos, no se realiza puntuación social, no se utiliza reconocimiento
              biométrico en tiempo real ni categorización biométrica con fines sensibles).
            </li>
            <li>
              <strong>Los usos no se incluyen en los supuestos de alto riesgo</strong> del
              Anexo III del Reglamento. La puntuación de oportunidades comerciales se
              utiliza para priorizar tareas de un equipo comercial humano y{' '}
              <em>no para decidir el acceso a empleo, crédito, servicios esenciales,
              educación, prestaciones públicas, asilo, control de fronteras o
              administración de justicia</em>.
            </li>
            <li>
              <strong>Los modelos integrados son sistemas de IA de propósito general</strong>{' '}
              (<em>GPAI</em>) proporcionados por proveedores que asumen las obligaciones
              correspondientes del Capítulo V del Reglamento.
            </li>
          </ul>
          <p>
            CONVERFLOW SL se reserva la revisión periódica de esta categorización y la
            adaptación de sus obligaciones a cualquier modificación normativa o de uso del
            sistema.
          </p>
        </section>

        {/* 4. Transparencia */}
        <section id="transparencia" className="scroll-mt-6">
          <h2>4. Aviso al usuario y transparencia</h2>
          <p>
            Conforme al artículo 50 del AI Act, CONVERFLOW SL garantiza que las personas
            interactuando con sistemas de IA están informadas de ello de manera clara,
            visible y comprensible:
          </p>
          <ul>
            <li>
              <strong>Aviso en el chat embebido en el sitio del cliente.</strong> El
              widget muestra de forma persistente la leyenda{' '}
              <em>&quot;Asistente de IA · puede cometer errores&quot;</em> y, antes de
              iniciar la conversación, un aviso destacado de que la interacción se realiza
              con un asistente de IA y la posibilidad de pedir el paso a una persona.
            </li>
            <li>
              <strong>Aviso en la bandeja de conversaciones del panel.</strong> Las
              respuestas o sugerencias generadas por IA se identifican mediante un banner
              de aviso y, en su caso, una etiqueta específica.
            </li>
            <li>
              <strong>Aviso en las funciones de scoring y análisis.</strong> Cuando un
              resultado ha sido producido por un sistema de IA (por ejemplo, la puntuación
              de un lead) se identifica mediante la etiqueta <em>&quot;Score IA&quot;</em>{' '}
              o equivalente.
            </li>
            <li>
              <strong>Aviso configurable por el cliente.</strong> Para cada agente
              conversacional, el cliente puede personalizar el mensaje inicial de aviso de
              uso de IA (campo <em>aiDisclosure</em>) que se inyecta al inicio de cada
              conversación nueva.
            </li>
            <li>
              <strong>Contenido generado por IA.</strong> Cuando proceda, las salidas
              generadas por IA podrán acompañarse de los metadatos exigidos por el artículo
              50.2 del AI Act para permitir su identificación como contenido sintético.
            </li>
          </ul>
        </section>

        {/* 5. Datos */}
        <section id="datos-ia" className="scroll-mt-6">
          <h2>5. Datos procesados por la IA</h2>
          <p>
            Para la prestación de las funcionalidades de IA descritas, se procesa:
          </p>
          <ul>
            <li>
              El contenido del mensaje del usuario final o, en su caso, los campos del
              contacto (nombre, datos profesionales, campos personalizados configurados
              por el cliente).
            </li>
            <li>
              Las instrucciones (<em>system prompt</em>) y la información de contexto
              definida por el cliente para su agente.
            </li>
            <li>
              El historial reciente de la conversación, estrictamente necesario para el
              hilo en curso.
            </li>
            <li>
              Datos técnicos derivados del propio procesamiento (latencia, identificadores
              de petición), nunca asociados a fines de perfilado del usuario final.
            </li>
          </ul>
          <p>
            <strong>Los datos transmitidos al proveedor del modelo no se utilizan para
            entrenar o reentrenar dicho modelo.</strong> CONVERFLOW SL ha suscrito con sus
            proveedores acuerdos de tratamiento de datos que establecen esta prohibición
            expresa, así como las condiciones de retención y eliminación.
          </p>
          <p>
            CONVERFLOW SL aplica el principio de minimización de datos (artículo 5.1.c del
            RGPD): solo se transmite al proveedor del modelo la información estrictamente
            necesaria para ejecutar la inferencia solicitada.
          </p>
        </section>

        {/* 6. Proveedores */}
        <section id="proveedores" className="scroll-mt-6">
          <h2>6. Proveedores de modelos y transferencias internacionales</h2>
          <p>
            El proveedor actual del componente de modelos de lenguaje es{' '}
            <strong>Anthropic PBC</strong>, sociedad estadounidense con la que CONVERFLOW
            SL ha firmado:
          </p>
          <ul>
            <li>
              <strong>Acuerdo de Tratamiento de Datos (DPA)</strong> conforme al artículo
              28 del RGPD.
            </li>
            <li>
              <strong>Cláusulas Contractuales Tipo</strong> aprobadas por la Decisión de
              Ejecución (UE) 2021/914 para las transferencias internacionales aplicables.
            </li>
            <li>
              <strong>Compromiso expreso de no utilizar los datos para entrenamiento</strong>{' '}
              de modelos.
            </li>
            <li>
              <strong>Plazos de retención reducidos</strong> en el proveedor del modelo,
              aplicables a la información de inferencia.
            </li>
          </ul>
          <p>
            CONVERFLOW SL evalúa continuamente alternativas para el procesamiento dentro
            del Espacio Económico Europeo, incluyendo despliegues regionales en la UE. La
            sustitución, incorporación o ampliación de proveedores se reflejará en esta
            página.
          </p>
        </section>

        {/* 7. Humano */}
        <section id="humano" className="scroll-mt-6">
          <h2>7. Intervención humana y supervisión</h2>
          <p>
            La plataforma está diseñada bajo el principio de <em>human-in-the-loop</em>{' '}
            (humano en el bucle). Las funcionalidades de IA pueden operar en dos modos
            configurables por el cliente para cada canal:
          </p>
          <ul>
            <li>
              <strong>Modo &quot;Sugerir&quot; (por defecto).</strong> La IA propone una
              respuesta o resultado y el operador humano lo revisa, edita o descarta antes
              de enviarlo al destinatario final.
            </li>
            <li>
              <strong>Modo &quot;Auto&quot;.</strong> La IA puede emitir respuestas
              directamente; el cliente puede en cualquier momento intervenir, desactivar el
              modo automático o cerrar la conversación.
            </li>
            <li>
              <strong>Modo &quot;Apagado&quot;.</strong> La IA no contesta; el canal se
              gestiona íntegramente por personal humano del cliente.
            </li>
          </ul>
          <p>
            Las decisiones que pueden generar efectos relevantes para el contacto (por
            ejemplo, la apertura de una oportunidad, el cambio de estado o la asignación a
            un responsable) están siempre subordinadas a la configuración del cliente y
            son reversibles. Ninguna de las funcionalidades produce, por sí sola, efectos
            jurídicos o impactos significativos sobre la persona en el sentido del
            artículo 22 del RGPD.
          </p>
        </section>

        {/* 8. Limitaciones */}
        <section id="limitaciones" className="scroll-mt-6">
          <h2>8. Limitaciones y riesgos conocidos</h2>
          <p>
            CONVERFLOW SL informa de las siguientes limitaciones inherentes a la
            tecnología utilizada:
          </p>
          <ul>
            <li>
              <strong>Posibilidad de respuestas incorrectas</strong> o imprecisas. Aunque
              se aplican técnicas de recuperación de contexto sobre la base de
              conocimiento del cliente, no es posible eliminar por completo el riesgo de
              que el modelo genere contenido inexacto.
            </li>
            <li>
              <strong>Sesgos potenciales.</strong> Los modelos pueden reflejar sesgos
              presentes en los datos sobre los que fueron preentrenados. CONVERFLOW SL
              evalúa este riesgo en el ámbito de los usos soportados y aplica medidas para
              mitigar su impacto.
            </li>
            <li>
              <strong>Limitaciones de actualidad.</strong> El conocimiento de los modelos
              tiene una fecha de corte; la información proporcionada por la IA debe ser
              contrastada cuando dependa de hechos recientes.
            </li>
            <li>
              <strong>Dependencia de la calidad del prompt y del contexto.</strong> La
              calidad de los resultados depende en buena medida de la configuración
              realizada por el cliente, así como de la corrección de los datos cargados en
              la plataforma.
            </li>
          </ul>
          <p>
            Estas limitaciones se comunican al usuario en los puntos de interacción
            relevantes y en la documentación interna del producto.
          </p>
        </section>

        {/* 9. Prohibidos */}
        <section id="prohibidos" className="scroll-mt-6">
          <h2>9. Casos de uso prohibidos</h2>
          <p>
            El usuario de la plataforma se obliga a no utilizar las funcionalidades de IA
            para finalidades prohibidas por el AI Act o por la normativa sectorial
            aplicable, ni para tratar categorías especiales de datos sin la base jurídica
            adecuada. En particular, queda expresamente prohibido:
          </p>
          <ul>
            <li>Cualquier uso que implique manipulación subliminal o explotación de vulnerabilidades.</li>
            <li>Sistemas de puntuación social de las personas físicas.</li>
            <li>
              Decisiones automatizadas con efectos jurídicos o impactos significativos
              sobre las personas en el sentido del artículo 22 del RGPD sin las garantías
              exigidas.
            </li>
            <li>
              Tratamiento de datos relativos a la salud, opiniones políticas, convicciones
              religiosas, orientación sexual u otros datos sensibles, salvo que el usuario
              cuente con base jurídica suficiente y haya formalizado el contrato de
              encargo correspondiente con CONVERFLOW SL.
            </li>
            <li>
              Tratamientos no permitidos por la legislación sectorial aplicable al cliente
              (financiera, sanitaria, laboral, etc.).
            </li>
          </ul>
        </section>

        {/* 10. Gobernanza */}
        <section id="gobernanza" className="scroll-mt-6">
          <h2>10. Gobernanza interna y registros</h2>
          <p>
            CONVERFLOW SL mantiene los siguientes elementos de gobernanza interna del
            sistema, accesibles al cliente o a las autoridades competentes cuando proceda:
          </p>
          <ul>
            <li>
              <strong>Documentación técnica</strong> sobre la arquitectura del sistema, los
              componentes de IA y los flujos de datos.
            </li>
            <li>
              <strong>Registro de actividades de tratamiento</strong> conforme al artículo
              30 del RGPD.
            </li>
            <li>
              <strong>Registro de eventos del sistema (logs)</strong> que permite trazar el
              uso de las funcionalidades de IA y las acciones realizadas por usuarios
              autenticados.
            </li>
            <li>
              <strong>Procedimientos de actualización del modelo</strong> y revisión de las
              cláusulas con proveedores ante cambios de versión.
            </li>
            <li>
              <strong>Plan de gestión de incidentes</strong> y procedimiento de notificación
              a la autoridad de control y, en su caso, a los interesados.
            </li>
          </ul>
        </section>

        {/* 11. Derechos */}
        <section id="derechos" className="scroll-mt-6">
          <h2>11. Derechos del interesado</h2>
          <p>
            Las personas cuyos datos sean tratados mediante las funcionalidades de IA
            pueden ejercitar los derechos reconocidos por el RGPD, incluido el derecho a:
          </p>
          <ul>
            <li>
              <strong>Información clara</strong> sobre el uso de IA en cada interacción
              relevante.
            </li>
            <li>
              <strong>Solicitar la intervención humana</strong> en cualquier momento
              durante una interacción con un asistente automatizado.
            </li>
            <li>
              <strong>Obtener explicaciones</strong> razonables sobre la lógica aplicada
              cuando una decisión basada en IA pudiera tener un impacto relevante.
            </li>
            <li>
              <strong>Oponerse al tratamiento</strong> mediante IA y solicitar la
              eliminación o rectificación de los datos asociados, conforme a los plazos y
              condiciones del RGPD.
            </li>
          </ul>
          <p>
            La información completa sobre el ejercicio de derechos se encuentra en la{' '}
            <Link href="/privacy">Política de Privacidad</Link>.
          </p>
        </section>

        {/* 12. Contacto */}
        <section id="contacto" className="scroll-mt-6">
          <h2>12. Contacto y reclamaciones</h2>
          <ul>
            <li>
              <strong>Asuntos relativos al uso de IA y derechos asociados:</strong>{' '}
              <a href="mailto:privacidad@converflow.ai">privacidad@converflow.ai</a>
            </li>
            <li>
              <strong>Asuntos legales:</strong>{' '}
              <a href="mailto:legal@converflow.ai">legal@converflow.ai</a>
            </li>
            <li>
              <strong>Autoridad de control en materia de protección de datos:</strong>{' '}
              Agencia Española de Protección de Datos &mdash;{' '}
              <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
                www.aepd.es
              </a>
            </li>
            <li>
              <strong>Marco AI Act:</strong> autoridad nacional competente designada
              conforme al artículo 70 del Reglamento (UE) 2024/1689, en los plazos
              previstos para su entrada en aplicación.
            </li>
          </ul>
        </section>

        <p className="text-xs text-ink-500">
          © {new Date().getFullYear()} CONVERFLOW SL. Todos los derechos reservados.
        </p>
      </article>
    </main>
  );
}
