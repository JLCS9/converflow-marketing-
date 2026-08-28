import type { Messages } from './es';

const fr: Messages = {
  nav: {
    home: 'Accueil',
    conversations: 'Conversations',
    alerts: 'Alertes',
    crm: 'CRM',
    ai: 'IA',
    campaigns: 'Campagnes',
    help: 'Aide',
    settings: 'Configuration',
    create: 'Créer',
    logout: 'Se déconnecter',
    mail: 'Courrier',
    messaging: 'Messagerie',
  },
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    loading: 'Chargement…',
    error: "L'opération n'a pas pu aboutir",
    search: 'Rechercher',
    close: 'Fermer',
  },
  profile: {
    language: "Langue de l'interface",
    languageHelp:
      'Ne change que votre affichage. Chaque membre de l’équipe peut choisir la sienne.',
  },
  automation: {
    title: 'IA et automatisation',
    intro:
      "C'est vous qui décidez ce que l'IA fait d'elle-même et combien elle peut dépenser. Rien de tout cela n'affecte les fonctions que vous déclenchez vous-même.",
    aiSection: 'Intelligence artificielle',
    alertsSection: 'Alertes automatiques',
    inboundTitle: 'Analyser automatiquement les messages entrants',
    inboundHelp:
      "Classe chaque message entrant et prépare une suggestion de réponse. C'est ce qui consomme le plus : cela s'exécute à chaque message.",
    capTitle: "Limite mensuelle d'utilisation de l'IA",
    capHelp: "Une fois la limite atteinte, l'IA s'arrête au lieu de continuer à dépenser. Vide = sans limite.",
    capUsage: 'Consommation ce mois-ci : {tokens} unités.',
    noLimit: 'sans limite',
    staleLead: 'Lead sans contact',
    staleLeadHelp: "Alerte lorsqu'un lead reste trop de jours sans premier contact.",
    days: 'jours',
    oppOverdue: 'Opportunité dont la date de clôture est dépassée',
    oppOverdueHelp: 'Alerte lorsque la date de clôture prévue est passée.',
    taskOverdue: 'Tâche en retard',
    taskOverdueHelp: "Alerte lorsqu'une tâche dépasse son échéance.",
    hotLead: 'Lead prioritaire',
    hotLeadHelp: "Alerte lorsqu'un lead dépasse le score indiqué et n'est toujours pas converti.",
    kitDigitalWarning:
      "Les alertes visuelles font partie des exigences de Kit Digital. Si vous les désactivez toutes, votre installation cesse de respecter ce point.",
  },
};

export default fr;
