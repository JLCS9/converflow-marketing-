export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  entityType: 'OPPORTUNITY';
  isDefault: boolean;
  archivedAt: string | null;
  stages: PipelineStage[];
}

export interface OppCard {
  id: string;
  name: string;
  amount: string | null;
  currency: string;
  status: string;
  stageId: string | null;
  pipelineId: string | null;
  probability: number;
  expectedCloseDate: string | null;
  createdAt: string;
  lead: { id: string; name: string; email: string | null; company: string | null } | null;
  client: { id: string; name: string; email: string | null } | null;
  stage: PipelineStage | null;
}
