import Link from 'next/link';

export const metadata = { title: 'Uso de IA · converflow.ai' };

export default function AiDisclosurePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← Volver
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Uso de Inteligencia Artificial</h1>
      <p className="mt-2 text-ink-500">
        Cumplimiento del Reglamento Europeo de IA (AI Act, Reglamento (UE) 2024/1689) y
        de las obligaciones de transparencia del programa Kit Digital.
      </p>

      <section className="prose prose-ink mt-10 max-w-none space-y-6 text-ink-700">
        <p>
          <strong>converflow.ai</strong> integra sistemas de Inteligencia Artificial para
          generar respuestas conversacionales, clasificar mensajes, extraer información de
          documentos y puntuar oportunidades comerciales. Esta página informa sobre el uso
          de IA en la plataforma de forma clara y accesible.
        </p>

        <h2>1. ¿Cuándo interactúas con un sistema de IA?</h2>
        <p>
          Siempre que tu mensaje en cualquier canal (WhatsApp, Instagram, Messenger, Web
          Chat) sea procesado por un agente automatizado en lugar de por una persona, la
          plataforma identifica esta interacción mediante:
        </p>
        <ul>
          <li>Un aviso visible al inicio de cada conversación en canales gestionados por nosotros.</li>
          <li>Un banner persistente en el panel de cliente indicando que la plataforma utiliza IA.</li>
          <li>Posibilidad de solicitar escalado a un humano en cualquier momento.</li>
        </ul>

        <h2>2. Modelos utilizados</h2>
        <p>
          Empleamos modelos de lenguaje de Anthropic (familia Claude) para generación de
          respuestas, clasificación y razonamiento. Los modelos OCR utilizados procesan
          únicamente documentos que tú subes voluntariamente.
        </p>

        <h2>3. Datos que se envían a los modelos</h2>
        <p>
          Las conversaciones de tus clientes se transmiten al proveedor del modelo para
          inferencia. Hemos firmado un Data Processing Agreement con Anthropic que prohíbe
          el uso de tus datos para entrenamiento. Si necesitas residencia de datos en la UE
          puedes solicitar el cambio al despliegue europeo (AWS Bedrock Frankfurt o Azure).
        </p>

        <h2>4. Tu derecho a no ser objeto de decisiones automatizadas</h2>
        <p>
          De acuerdo con el RGPD, tienes derecho a no ser objeto de una decisión basada
          únicamente en el tratamiento automatizado de tus datos. La plataforma escala al
          humano siempre que la IA detecta incertidumbre alta, una queja, una solicitud
          explícita, o cualquier asunto que tu equipo haya configurado como
          &quot;requiere humano&quot;.
        </p>

        <h2>5. Riesgos y limitaciones</h2>
        <ul>
          <li>
            Los modelos pueden generar respuestas incorrectas (&quot;alucinaciones&quot;).
            Mantenemos la respuesta dentro del contexto de tu negocio mediante RAG sobre
            tu base de conocimiento, pero no se elimina el riesgo por completo.
          </li>
          <li>
            La plataforma no toma decisiones que produzcan efectos jurídicos sobre las
            personas (contratación, denegación de servicios, etc.) sin revisión humana.
          </li>
        </ul>

        <h2>6. Documentación técnica</h2>
        <p>
          Documentación técnica completa, casos de uso, modelo de gobernanza y registros
          de evaluación de riesgos están a disposición del beneficiario en formato PDF
          desde el panel de cliente (sección Ajustes &gt; Documentación). Si necesitas
          acceso anticipado, escríbenos a{' '}
          <a href="mailto:legal@converflow.ai">legal@converflow.ai</a>.
        </p>

        <h2>7. Contacto</h2>
        <p>
          Responsable: <strong>CSO Digital SL</strong>. Email DPO:{' '}
          <a href="mailto:dpo@converflow.ai">dpo@converflow.ai</a>.
        </p>
      </section>
    </main>
  );
}
