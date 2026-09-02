export interface SourceRow {
  sourceRef: string;
  title: string;
  chunks: number;
  embedded: number;
  updatedAt: string;
}

export interface GapRow {
  id: string;
  question: string;
  count: number;
  hasWaitingLead: boolean;
  samples: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstructionRow {
  id: string;
  order: number;
  content: string;
  source: string;
}

export interface VerifiedRow {
  id: string;
  question: string;
  answer: string;
  verifiedBy: string | null;
  validUntil: string | null;
  createdAt: string;
}

export interface RegressionRow {
  id: string;
  question: string;
  expect: string;
  active: boolean;
  lastStatus: 'PASS' | 'FAIL' | null;
  lastRunAt: string | null;
}

export interface IdentityView {
  agentId: string;
  tone: string;
  language: string;
  aiDisclosure: string;
  tools: string[];
}

export interface VerticalOption {
  key: string;
  name: string;
  version: number;
  fields: number;
  states: number;
}

export interface TesterTurn {
  direction: 'IN' | 'OUT';
  body: string;
  meta?: {
    canAnswer: boolean;
    wouldExtract: string[];
    wouldActions: string[];
    sources: { kind: string; content: string }[];
  };
}
