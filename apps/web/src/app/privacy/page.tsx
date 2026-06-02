import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad · converflow.ai',
  description:
    'Política de privacidad de Converflow SL conforme al Reglamento (UE) 2016/679 (RGPD), la LOPDGDD (LO 3/2018) y la LSSI-CE (Ley 34/2002).',
};

const LAST_UPDATE = '2 de junio de 2026';

interface TocItem {
  id: string;
  title: string;
}

const TOC: TocItem[] = [
  { id: 'resumen', title: 'Resumen' },
  { id: 'responsable', title: '1. Responsable del tratamiento' },
  { id: 'datos', title: '2. Datos personales tratados' },
  { id: 'finalidades', title: '3. Finalidades y base jurídica' },
  { id: 'conservacion', title: '4. Plazos de conservación' },
  { id: 'destinatarios', title: '5. Destinatarios y encargados del tratamiento' },
  { id: 'transferencias', title: '6. Transferencias internacionales' },
  { id: 'derechos', title: '7. Derechos del interesado' },
  { id: 'decisiones-automatizadas', title: '8. Decisiones automatizadas y perfiles' },
  { id: 'cookies', title: '9. Cookies y tecnologías similares' },
  { id: 'menores', title: '10. Menores de edad' },
  { id: 'seguridad', title: '11. Medidas de seguridad' },
  { id: 'cambios', title: '12. Modificaciones de la política' },
  { id: 'contacto', title: '13. Reclamaciones y contacto' },
];

/**
 * Public privacy policy aligned with:
 *  - Reglamento (UE) 2016/679 (RGPD / GDPR)
 *  - LO 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD)
 *  - Ley 34/2002, de servicios de la sociedad de la información (LSSI-CE)
 *  - Directiva 2002/58/CE (ePrivacy)
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← Volver a converflow.ai
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-ink-500">
        Versión vigente desde el {LAST_UPDATE}. Aplicable a todos los servicios prestados a
        través de los dominios <code>converflow.ai</code>, <code>app.converflow.ai</code>,{' '}
        <code>api.converflow.ai</code> y subdominios asociados.
      </p>

      {/* TOC */}
      <nav
        aria-label="Índice de la política"
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
          <h2>Resumen de la información clave</h2>
          <table>
            <tbody>
              <tr>
                <th>Responsable</th>
                <td>
                  <strong>CONVERFLOW SL</strong> · NIF B19934371 · Calle Playa de Calafell 9,
                  28290 Las Rozas de Madrid (Madrid, España)
                </td>
              </tr>
              <tr>
                <th>Finalidades</th>
                <td>
                  Prestación del servicio SaaS contratado, gestión de la relación
                  contractual, soporte, cumplimiento legal y mejora del producto.
                </td>
              </tr>
              <tr>
                <th>Base jurídica</th>
                <td>
                  Ejecución del contrato, obligación legal, interés legítimo y, cuando
                  procede, consentimiento del interesado.
                </td>
              </tr>
              <tr>
                <th>Categorías de datos</th>
                <td>
                  Datos identificativos y de contacto, datos profesionales, datos de
                  navegación y uso, contenidos cargados por el cliente, logs de acceso.
                </td>
              </tr>
              <tr>
                <th>Destinatarios</th>
                <td>
                  Encargados del tratamiento estrictamente necesarios (hosting,
                  proveedores de IA, email transaccional). No se ceden datos a terceros con
                  fines comerciales.
                </td>
              </tr>
              <tr>
                <th>Transferencias internacionales</th>
                <td>
                  Algunos encargados están establecidos fuera del EEE. Se aplican garantías
                  conforme al Capítulo V del RGPD (Cláusulas Contractuales Tipo y, cuando
                  corresponde, decisión de adecuación &mdash; <em>EU&nbsp;US Data Privacy
                  Framework</em>).
                </td>
              </tr>
              <tr>
                <th>Derechos</th>
                <td>
                  Acceso, rectificación, supresión, oposición, limitación, portabilidad y
                  retirada del consentimiento. Ejercitables en{' '}
                  <a href="mailto:privacidad@converflow.ai">privacidad@converflow.ai</a>.
                </td>
              </tr>
              <tr>
                <th>Reclamación</th>
                <td>
                  Agencia Española de Protección de Datos (
                  <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
                    www.aepd.es
                  </a>
                  ).
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 1. Responsable */}
        <section id="responsable" className="scroll-mt-6">
          <h2>1. Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de los datos personales recogidos a través de los
            sitios y servicios de Converflow es:
          </p>
          <ul>
            <li>
              <strong>Denominación social:</strong> CONVERFLOW SL
            </li>
            <li>
              <strong>NIF:</strong> B19934371
            </li>
            <li>
              <strong>Domicilio social:</strong> Calle Playa de Calafell, 9 – 28290 Las
              Rozas de Madrid, Madrid (España)
            </li>
            <li>
              <strong>Correo electrónico de privacidad:</strong>{' '}
              <a href="mailto:privacidad@converflow.ai">privacidad@converflow.ai</a>
            </li>
            <li>
              <strong>Correo electrónico de contacto general:</strong>{' '}
              <a href="mailto:legal@converflow.ai">legal@converflow.ai</a>
            </li>
          </ul>
          <p>
            CONVERFLOW SL <strong>no está obligada a designar un Delegado de Protección de
            Datos (DPO)</strong> en los términos del artículo 37 del RGPD. No obstante, ha
            habilitado el canal específico <em>privacidad@converflow.ai</em> para atender
            cualquier asunto relacionado con el tratamiento de datos personales.
          </p>
        </section>

        {/* 2. Datos */}
        <section id="datos" className="scroll-mt-6">
          <h2>2. Datos personales tratados</h2>
          <p>
            En función del servicio utilizado y de la relación que el interesado mantenga
            con CONVERFLOW SL, se tratan las siguientes categorías de datos:
          </p>
          <h3>2.1. Datos de usuarios de la plataforma (cuentas profesionales)</h3>
          <ul>
            <li>Datos identificativos: nombre, apellidos.</li>
            <li>
              Datos de contacto: dirección de correo electrónico, teléfono profesional.
            </li>
            <li>Datos profesionales: empresa, cargo, rol asignado en la plataforma.</li>
            <li>
              Datos técnicos: dirección IP, user-agent, fecha y hora de acceso, eventos de
              auditoría.
            </li>
            <li>
              Credenciales de acceso (almacenadas exclusivamente como derivaciones
              criptográficas con Argon2id; nunca se almacena la contraseña en texto plano).
            </li>
          </ul>
          <h3>2.2. Datos de clientes finales del usuario (contactos en el CRM)</h3>
          <p>
            En su condición de cliente, el usuario de la plataforma puede cargar datos de
            sus propios contactos. Respecto de estos datos, <strong>CONVERFLOW SL actúa como
            encargado del tratamiento</strong> conforme al artículo 28 del RGPD, siendo el
            usuario el responsable del tratamiento. Estos datos pueden incluir:
          </p>
          <ul>
            <li>Datos identificativos y de contacto del contacto (lead o cliente).</li>
            <li>Contenido de las conversaciones intercambiadas por los canales habilitados.</li>
            <li>Documentación adjunta cargada por el usuario o por su contacto.</li>
            <li>
              Campos personalizados definidos por el usuario, cuya naturaleza es libremente
              elegida por éste.
            </li>
          </ul>
          <h3>2.3. Datos de visitantes del sitio web público</h3>
          <ul>
            <li>
              Datos de navegación: dirección IP, identificadores de cookies estrictamente
              necesarias, páginas visitadas y referrer.
            </li>
            <li>
              Datos voluntariamente facilitados a través de formularios de contacto o de
              registro.
            </li>
          </ul>
          <p>
            CONVERFLOW SL <strong>no trata categorías especiales de datos</strong> (artículo
            9 del RGPD) salvo que el usuario decida cargarlos en su instancia, en cuyo caso
            será el responsable de obtener la base jurídica adecuada conforme al artículo
            9.2 del RGPD.
          </p>
        </section>

        {/* 3. Finalidades */}
        <section id="finalidades" className="scroll-mt-6">
          <h2>3. Finalidades y base jurídica del tratamiento</h2>
          <table>
            <thead>
              <tr>
                <th>Finalidad</th>
                <th>Base jurídica</th>
                <th>Categorías de datos</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Alta, gestión y prestación del servicio SaaS contratado, autenticación y
                  control de accesos.
                </td>
                <td>Ejecución del contrato (art. 6.1.b RGPD).</td>
                <td>Identificativos, contacto, técnicos, profesionales.</td>
              </tr>
              <tr>
                <td>Facturación y cumplimiento de obligaciones contables y fiscales.</td>
                <td>
                  Obligación legal (art. 6.1.c RGPD; Ley 58/2003 General Tributaria; Código
                  de Comercio).
                </td>
                <td>Identificativos, fiscales, profesionales.</td>
              </tr>
              <tr>
                <td>
                  Atención al cliente, soporte técnico y gestión de incidencias.
                </td>
                <td>Ejecución del contrato (art. 6.1.b RGPD).</td>
                <td>Identificativos, contacto, técnicos.</td>
              </tr>
              <tr>
                <td>
                  Mantenimiento, seguridad, prevención del fraude y auditoría de la
                  plataforma.
                </td>
                <td>Interés legítimo (art. 6.1.f RGPD).</td>
                <td>Técnicos, logs de acceso.</td>
              </tr>
              <tr>
                <td>
                  Mejora del servicio mediante análisis agregados y anonimizados.
                </td>
                <td>Interés legítimo (art. 6.1.f RGPD).</td>
                <td>Datos de uso agregados.</td>
              </tr>
              <tr>
                <td>
                  Envío de comunicaciones comerciales sobre productos y servicios propios.
                </td>
                <td>
                  Consentimiento (art. 6.1.a RGPD) o interés legítimo en relación con
                  clientes existentes para productos similares (considerando 47 RGPD).
                </td>
                <td>Identificativos, contacto.</td>
              </tr>
              <tr>
                <td>
                  Cumplimiento de obligaciones derivadas del programa Kit Digital,
                  conservación de evidencias y auditoría.
                </td>
                <td>
                  Obligación legal (art. 6.1.c RGPD) y bases reguladoras del programa Kit
                  Digital.
                </td>
                <td>Logs de acceso, eventos de auditoría.</td>
              </tr>
            </tbody>
          </table>
          <p>
            La realización de un test de ponderación específico para los tratamientos
            basados en interés legítimo está a disposición del interesado a través del canal
            de privacidad indicado en esta política.
          </p>
        </section>

        {/* 4. Conservación */}
        <section id="conservacion" className="scroll-mt-6">
          <h2>4. Plazos de conservación</h2>
          <p>
            Los datos personales se conservan durante el tiempo estrictamente necesario para
            las finalidades del tratamiento y, en todo caso, durante los plazos legales
            aplicables. Con carácter orientativo:
          </p>
          <ul>
            <li>
              <strong>Datos de cuenta y configuración de la plataforma:</strong> mientras
              dure la relación contractual y hasta tres (3) años después de su finalización
              a efectos de posibles reclamaciones.
            </li>
            <li>
              <strong>Datos contables y fiscales:</strong> seis (6) años conforme al Código
              de Comercio y cuatro (4) años en lo que se refiere a la Ley General
              Tributaria.
            </li>
            <li>
              <strong>Logs de acceso y registros de auditoría:</strong> entre doce (12) y
              veinticuatro (24) meses, según la criticidad del evento y los requisitos de
              Kit Digital.
            </li>
            <li>
              <strong>Datos cargados por el usuario en su instancia (CRM):</strong>{' '}
              mientras dure la relación contractual. Tras la baja, se garantiza un periodo
              razonable para la exportación de datos y, posteriormente, se eliminan
              conforme al apartado siguiente.
            </li>
            <li>
              <strong>Solicitudes ejercicio de derechos:</strong> tres (3) años desde la
              respuesta, conforme a la doctrina de la AEPD.
            </li>
          </ul>
          <p>
            Transcurridos los plazos aplicables, los datos se eliminan de forma segura o se
            anonimizan de modo irreversible para fines estadísticos.
          </p>
        </section>

        {/* 5. Encargados */}
        <section id="destinatarios" className="scroll-mt-6">
          <h2>5. Destinatarios y encargados del tratamiento</h2>
          <p>
            CONVERFLOW SL <strong>no cede datos personales a terceros</strong> salvo
            obligación legal. Para la prestación del servicio recurre a proveedores que
            actúan como <strong>encargados del tratamiento</strong> conforme al artículo 28
            del RGPD, todos ellos vinculados por contratos que garantizan un nivel de
            protección equivalente al exigido por la normativa europea.
          </p>
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Finalidad</th>
                <th>Ubicación del tratamiento</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hostinger International Ltd.</td>
                <td>Hosting e infraestructura de servidores.</td>
                <td>Centro de datos en la Unión Europea.</td>
              </tr>
              <tr>
                <td>Anthropic PBC</td>
                <td>
                  Proveedor de modelos de lenguaje empleados por las funcionalidades de IA.
                </td>
                <td>
                  Estados Unidos, con garantías del Capítulo V del RGPD (véase apartado 6).
                </td>
              </tr>
              <tr>
                <td>Resend, Inc.</td>
                <td>Envío de correo electrónico transaccional.</td>
                <td>
                  Estados Unidos, con garantías del Capítulo V del RGPD (véase apartado 6).
                </td>
              </tr>
              <tr>
                <td>Cloudflare, Inc.</td>
                <td>
                  Red de distribución de contenido, seguridad y mitigación de ataques.
                </td>
                <td>
                  Red global con presencia en la Unión Europea; aplicación de medidas
                  conforme al Capítulo V del RGPD.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            CONVERFLOW SL podrá incorporar o sustituir encargados conforme evolucione su
            arquitectura. Cualquier incorporación se reflejará en esta política y se
            comunicará a los clientes con antelación razonable cuando contractualmente
            corresponda.
          </p>
        </section>

        {/* 6. Transferencias */}
        <section id="transferencias" className="scroll-mt-6">
          <h2>6. Transferencias internacionales</h2>
          <p>
            Algunos encargados del tratamiento están establecidos fuera del Espacio
            Económico Europeo. Para garantizar un nivel adecuado de protección, CONVERFLOW
            SL implementa, según corresponda en cada caso:
          </p>
          <ul>
            <li>
              <strong>Decisiones de adecuación</strong> dictadas por la Comisión Europea
              (por ejemplo, <em>EU-US Data Privacy Framework</em> respecto de proveedores
              estadounidenses certificados).
            </li>
            <li>
              <strong>Cláusulas Contractuales Tipo</strong> aprobadas por la Comisión
              Europea (Decisión de Ejecución (UE) 2021/914).
            </li>
            <li>
              <strong>Medidas suplementarias técnicas y organizativas</strong> (cifrado en
              tránsito y en reposo, minimización de datos transferidos, controles de
              acceso).
            </li>
          </ul>
          <p>
            Puede solicitarse copia de las garantías aplicables mediante el canal de
            privacidad indicado.
          </p>
        </section>

        {/* 7. Derechos */}
        <section id="derechos" className="scroll-mt-6">
          <h2>7. Derechos del interesado</h2>
          <p>
            El interesado puede ejercitar en cualquier momento los siguientes derechos
            reconocidos por el RGPD y la LOPDGDD:
          </p>
          <ul>
            <li>
              <strong>Acceso</strong> a los datos personales tratados (art. 15 RGPD).
            </li>
            <li>
              <strong>Rectificación</strong> de los datos inexactos o incompletos (art. 16
              RGPD).
            </li>
            <li>
              <strong>Supresión</strong> de los datos cuando ya no sean necesarios o cuando
              concurran las circunstancias del artículo 17 del RGPD.
            </li>
            <li>
              <strong>Oposición</strong> al tratamiento (art. 21 RGPD).
            </li>
            <li>
              <strong>Limitación</strong> del tratamiento (art. 18 RGPD).
            </li>
            <li>
              <strong>Portabilidad</strong> de los datos en un formato estructurado, de uso
              común y lectura mecánica (art. 20 RGPD).
            </li>
            <li>
              <strong>Retirada del consentimiento</strong> en cualquier momento, sin que ello
              afecte a la licitud del tratamiento previo (art. 7.3 RGPD).
            </li>
            <li>
              <strong>No ser objeto de decisiones individuales automatizadas</strong>{' '}
              incluida la elaboración de perfiles, cuando produzcan efectos jurídicos o
              afecten significativamente al interesado (art. 22 RGPD; véase apartado 8).
            </li>
          </ul>
          <p>
            Los derechos se ejercitan mediante solicitud dirigida a{' '}
            <a href="mailto:privacidad@converflow.ai">privacidad@converflow.ai</a>{' '}
            acompañada de documento acreditativo de la identidad o medio equivalente. La
            respuesta se proporciona en el plazo máximo de un mes, prorrogable conforme al
            artículo 12.3 del RGPD.
          </p>
          <p>
            Si el interesado considera que sus derechos no han sido debidamente atendidos,
            puede presentar una reclamación ante la Agencia Española de Protección de Datos
            (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
              www.aepd.es
            </a>
            , C/ Jorge Juan 6, 28001 Madrid).
          </p>
        </section>

        {/* 8. Decisiones automatizadas */}
        <section id="decisiones-automatizadas" className="scroll-mt-6">
          <h2>8. Decisiones automatizadas y elaboración de perfiles</h2>
          <p>
            Determinadas funcionalidades de la plataforma utilizan sistemas de inteligencia
            artificial para puntuar oportunidades comerciales, clasificar mensajes y
            sugerir respuestas. Estas funcionalidades:
          </p>
          <ul>
            <li>
              <strong>No producen efectos jurídicos</strong> ni afectan significativamente
              al interesado en el sentido del artículo 22 del RGPD: el resultado es siempre
              una recomendación que debe ser revisada por el usuario humano antes de
              materializarse en cualquier acción frente al contacto.
            </li>
            <li>
              <strong>Permiten la intervención humana</strong> en todo momento, incluyendo
              la posibilidad de modificar o descartar las sugerencias del sistema.
            </li>
            <li>
              <strong>No utilizan</strong> categorías especiales de datos para tomar
              decisiones, salvo que el responsable del tratamiento (cliente de la
              plataforma) configure expresamente dicho tratamiento bajo su propia base
              jurídica.
            </li>
          </ul>
          <p>
            Información adicional específica sobre el uso de IA y el cumplimiento del
            Reglamento (UE) 2024/1689 (AI Act) en la página de{' '}
            <Link href="/ai-disclosure">Uso de Inteligencia Artificial</Link>.
          </p>
        </section>

        {/* 9. Cookies */}
        <section id="cookies" className="scroll-mt-6">
          <h2>9. Cookies y tecnologías similares</h2>
          <p>
            El sitio web y la plataforma utilizan exclusivamente <strong>cookies
            técnicas estrictamente necesarias</strong> para la prestación del servicio
            (autenticación, mantenimiento de sesión, seguridad). Estas cookies no requieren
            consentimiento previo conforme al artículo 22.2 de la LSSI-CE.
          </p>
          <p>
            En caso de que en el futuro se incorporen cookies analíticas, de personalización
            o publicitarias, se solicitará el consentimiento del usuario mediante un banner
            de configuración granular conforme a las directrices del Comité Europeo de
            Protección de Datos y de la AEPD.
          </p>
        </section>

        {/* 10. Menores */}
        <section id="menores" className="scroll-mt-6">
          <h2>10. Menores de edad</h2>
          <p>
            Los servicios de Converflow están dirigidos exclusivamente a personas jurídicas
            y profesionales mayores de edad. No se recogen ni tratan deliberadamente datos
            personales de menores de catorce (14) años conforme al artículo 7 de la
            LOPDGDD. Si se detecta que se han recibido datos de un menor sin consentimiento
            válido, se procederá a su supresión inmediata.
          </p>
        </section>

        {/* 11. Seguridad */}
        <section id="seguridad" className="scroll-mt-6">
          <h2>11. Medidas de seguridad</h2>
          <p>
            CONVERFLOW SL aplica medidas técnicas y organizativas apropiadas conforme al
            artículo 32 del RGPD, atendiendo al estado de la técnica, los costes de
            aplicación, la naturaleza del tratamiento y los riesgos identificados. Entre
            otras:
          </p>
          <ul>
            <li>
              <strong>Cifrado en tránsito</strong> mediante TLS 1.2 o superior en todos los
              canales públicos.
            </li>
            <li>
              <strong>Cifrado en reposo</strong> para credenciales sensibles y datos de
              autenticación de canales externos.
            </li>
            <li>
              <strong>Aislamiento estricto por cliente</strong> a nivel de base de datos
              mediante <em>Row Level Security</em>; ningún cliente puede acceder a datos de
              otra cuenta.
            </li>
            <li>
              <strong>Autenticación reforzada</strong>: hashing con Argon2id, política de
              contraseñas, soporte de doble factor para el panel de administración.
            </li>
            <li>
              <strong>Auditoría inmutable</strong> de accesos y acciones relevantes,
              accesible al cliente desde su panel.
            </li>
            <li>
              <strong>Copias de seguridad</strong> cifradas con rotación periódica.
            </li>
            <li>
              <strong>Procedimientos de respuesta a incidentes</strong> con notificación a
              la autoridad de control en un plazo máximo de setenta y dos (72) horas cuando
              proceda conforme al artículo 33 del RGPD.
            </li>
          </ul>
        </section>

        {/* 12. Cambios */}
        <section id="cambios" className="scroll-mt-6">
          <h2>12. Modificaciones de esta política</h2>
          <p>
            CONVERFLOW SL podrá actualizar la presente política para adaptarla a cambios
            normativos, a la evolución del servicio o a recomendaciones de las autoridades
            de control. La fecha indicada al inicio refleja la versión vigente. Cuando los
            cambios sean materiales se notificarán a los usuarios por correo electrónico o
            mediante un aviso destacado en la plataforma.
          </p>
        </section>

        {/* 13. Contacto */}
        <section id="contacto" className="scroll-mt-6">
          <h2>13. Reclamaciones y contacto</h2>
          <ul>
            <li>
              <strong>Privacidad y derechos RGPD:</strong>{' '}
              <a href="mailto:privacidad@converflow.ai">privacidad@converflow.ai</a>
            </li>
            <li>
              <strong>Asuntos legales:</strong>{' '}
              <a href="mailto:legal@converflow.ai">legal@converflow.ai</a>
            </li>
            <li>
              <strong>Soporte del servicio:</strong>{' '}
              <a href="mailto:soporte@converflow.ai">soporte@converflow.ai</a>
            </li>
            <li>
              <strong>Autoridad de control:</strong> Agencia Española de Protección de
              Datos &mdash;{' '}
              <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
                www.aepd.es
              </a>
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
