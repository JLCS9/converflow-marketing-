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
