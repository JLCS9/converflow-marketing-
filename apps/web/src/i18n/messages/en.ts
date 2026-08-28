import type { Messages } from './es';

const en: Messages = {
  nav: {
    home: 'Home',
    conversations: 'Conversations',
    alerts: 'Alerts',
    crm: 'CRM',
    ai: 'AI',
    campaigns: 'Campaigns',
    help: 'Help',
    settings: 'Settings',
    create: 'Create',
    logout: 'Sign out',
    mail: 'Mail',
    messaging: 'Messaging',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
    saved: 'Saved',
    loading: 'Loading…',
    error: 'Something went wrong',
    search: 'Search',
    close: 'Close',
  },
  profile: {
    language: 'Interface language',
    languageHelp: 'Only changes what you see. Each teammate can pick their own.',
  },
  automation: {
    title: 'AI and automation',
    intro:
      'You decide what the AI does on its own and how much it may spend. None of this affects features you trigger yourself.',
    aiSection: 'Artificial intelligence',
    alertsSection: 'Automatic alerts',
    inboundTitle: 'Automatically analyse incoming messages',
    inboundHelp:
      'Classifies every incoming message and drafts a suggested reply. This is the heaviest consumer: it runs on every message.',
    capTitle: 'Monthly AI usage limit',
    capHelp: 'On reaching the limit the AI stops instead of spending more. Empty = no limit.',
    capUsage: 'Used this month: {tokens} units.',
    noLimit: 'no limit',
    staleLead: 'Lead not contacted',
    staleLeadHelp: 'Warns when a lead has gone too many days without first contact.',
    days: 'days',
    oppOverdue: 'Opportunity past its close date',
    oppOverdueHelp: 'Warns when the expected close date has passed.',
    taskOverdue: 'Overdue task',
    taskOverdueHelp: 'Warns when a task passes its due date.',
    hotLead: 'High-priority lead',
    hotLeadHelp: 'Warns when a lead scores above the given threshold and is still not converted.',
    kitDigitalWarning:
      'Visual alerts are one of the Kit Digital requirements. Turning them all off means your installation no longer meets that point.',
  },
};

export default en;
