/**
 * Castellano — el idioma de referencia.
 *
 * Las claves se agrupan por zona de la interfaz. Al añadir una cadena aquí hay
 * que añadirla también en en.ts y fr.ts: el test de paridad de claves falla si
 * falta alguna, para que no aparezca texto en español dentro de una interfaz
 * en inglés.
 */
const es = {
  nav: {
    home: 'Inicio',
    conversations: 'Conversaciones',
    alerts: 'Alertas',
    crm: 'CRM',
    ai: 'IA',
    campaigns: 'Campañas',
    help: 'Ayuda',
    settings: 'Configuración',
    create: 'Crear',
    logout: 'Salir',
    mail: 'Correo',
    messaging: 'Mensajería',
  },
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    saving: 'Guardando…',
    saved: 'Guardado',
    loading: 'Cargando…',
    error: 'No se pudo completar la operación',
    search: 'Buscar',
    close: 'Cerrar',
  },
  profile: {
    language: 'Idioma de la interfaz',
    languageHelp:
      'Solo cambia lo que ves tú. Cada persona del equipo puede tener el suyo.',
  },
  automation: {
    title: 'IA y automatización',
    intro:
      'Decides tú qué hace la IA por su cuenta y cuánto puede gastar. Nada de esto afecta a las funciones que pides a mano.',
    aiSection: 'Inteligencia artificial',
    alertsSection: 'Alertas automáticas',
    inboundTitle: 'Analizar automáticamente los mensajes que llegan',
    inboundHelp:
      'Clasifica cada mensaje entrante y prepara una sugerencia de respuesta. Es lo que más consume: se ejecuta en cada mensaje.',
    capTitle: 'Límite mensual de uso de IA',
    capHelp: 'Al alcanzar el límite, la IA se detiene en lugar de seguir gastando. Vacío = sin límite.',
    capUsage: 'Consumo de este mes: {tokens} unidades.',
    noLimit: 'sin límite',
    staleLead: 'Lead sin contactar',
    staleLeadHelp: 'Avisa cuando un lead lleva demasiados días sin primer contacto.',
    days: 'días',
    oppOverdue: 'Oportunidad con cierre vencido',
    oppOverdueHelp: 'Avisa cuando pasa la fecha prevista de cierre.',
    taskOverdue: 'Tarea vencida',
    taskOverdueHelp: 'Avisa cuando una tarea pasa su fecha de vencimiento.',
    hotLead: 'Lead de alta prioridad',
    hotLeadHelp: 'Avisa cuando un lead supera la puntuación indicada y sigue sin convertir.',
    kitDigitalWarning:
      'Las alertas gráficas son uno de los requisitos de Kit Digital. Si desactivas todas, tu instalación deja de cumplir ese punto.',
  },
};

export default es;

/**
 * Contrato de las traducciones: las mismas claves, con valores string.
 *
 * Sin `as const` a propósito — con él, el tipo fijaría los TEXTOS en castellano
 * y ninguna traducción compilaría. Lo que tiene que imponer es la forma.
 */
export type Messages = typeof es;
