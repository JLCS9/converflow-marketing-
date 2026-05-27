import Link from 'next/link';

export const metadata = { title: 'Privacidad · converflow.ai' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← Volver
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="mt-2 text-ink-500">
        Última actualización: {new Date().toLocaleDateString('es-ES')}. Cumplimiento RGPD
        (Reglamento (UE) 2016/679) y LOPDGDD (LO 3/2018).
      </p>

      <section className="prose prose-ink mt-10 max-w-none space-y-6 text-ink-700">
        <h2>1. Responsable del tratamiento</h2>
        <p>
          <strong>CSO Digital SL</strong> · NIF [pendiente] · Domicilio social: [pendiente] ·
          Email contacto: <a href="mailto:legal@converflow.ai">legal@converflow.ai</a> ·
          DPO: <a href="mailto:dpo@converflow.ai">dpo@converflow.ai</a>.
        </p>

        <h2>2. Datos personales tratados</h2>
        <ul>
          <li>
            <strong>Cuentas de la plataforma</strong>: email, nombre, rol, fecha de último
            login, dirección IP de acceso, user-agent.
          </li>
          <li>
            <strong>Conversaciones con clientes finales</strong>: contenido del mensaje,
            número/identificador de la cuenta del canal (ej. teléfono WhatsApp), timestamp.
          </li>
          <li>
            <strong>Datos cargados por el cliente</strong>: documentos subidos para OCR,
            registros importados al CRM, contactos.
          </li>
          <li>
            <strong>Logs de acceso</strong>: registros inmutables de todas las acciones
            autenticadas en la plataforma (evidencia Kit Digital).
          </li>
        </ul>

        <h2>3. Finalidades y base legal</h2>
        <table>
          <thead>
            <tr>
              <th>Finalidad</th>
              <th>Base legal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Prestación del servicio contratado</td>
              <td>Ejecución de contrato (art. 6.1.b RGPD)</td>
            </tr>
            <tr>
              <td>Cumplimiento de obligaciones legales</td>
              <td>Obligación legal (art. 6.1.c RGPD)</td>
            </tr>
            <tr>
              <td>Mejora del servicio y seguridad</td>
              <td>Interés legítimo (art. 6.1.f RGPD)</td>
            </tr>
            <tr>
              <td>Comunicaciones comerciales</td>
              <td>Consentimiento (art. 6.1.a RGPD)</td>
            </tr>
          </tbody>
        </table>

        <h2>4. Conservación</h2>
        <p>
          Mientras dure la relación contractual y durante los plazos legales aplicables
          (Ley 7/2012, Código de Comercio, normativa fiscal). Los logs de acceso se
          conservan al menos 12 meses para cumplir con Kit Digital. Datos de
          conversaciones se conservan según el plan contratado y pueden eliminarse a
          petición del cliente.
        </p>

        <h2>5. Encargados del tratamiento</h2>
        <ul>
          <li>
            <strong>Hostinger</strong> (servidor): hosting de la plataforma en Madrid (UE).
          </li>
          <li>
            <strong>Anthropic PBC</strong> (USA): proveedor del modelo de IA. Tratamiento
            bajo DPA + Cláusulas Contractuales Tipo (CCT).
          </li>
          <li>
            <strong>Resend</strong> (USA): envío de emails transaccionales. CCT.
          </li>
        </ul>

        <h2>6. Tus derechos</h2>
        <p>
          Acceso, rectificación, supresión, oposición, limitación, portabilidad y a no ser
          objeto de decisiones automatizadas. Ejercitables enviando email a{' '}
          <a href="mailto:dpo@converflow.ai">dpo@converflow.ai</a>. Si crees que no hemos
          tratado correctamente tus datos, puedes reclamar ante la Agencia Española de
          Protección de Datos (<a href="https://www.aepd.es">www.aepd.es</a>).
        </p>

        <h2>7. Seguridad</h2>
        <p>
          Cifrado TLS en tránsito, cifrado AES-256-GCM en reposo para credenciales de
          canales, aislamiento multitenant a nivel de base de datos (Row Level Security),
          auditoría completa de accesos, backups cifrados.
        </p>
      </section>
    </main>
  );
}
