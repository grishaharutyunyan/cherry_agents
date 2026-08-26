export type AiAgentRunPhase =
  | 'parsing'
  | 'design'
  | 'awaiting_approval'
  | 'building'
  | 'qa'
  | 'retry_design'
  | 'retry_build'
  | 'finalizing'
  | 'done'
  | 'failed'
  | 'cancelled';

export const AI_AGENT_RUN_TERMINAL_PHASES: AiAgentRunPhase[] = ['done', 'failed', 'cancelled'];

/** Skipped by the worker's claim query — only the admin approve endpoint moves a run out of this phase. */
export const AI_AGENT_RUN_PARKED_PHASES: AiAgentRunPhase[] = ['awaiting_approval'];

export interface AiAgentRunParsedFields {
  gameId: string;
  gameName: string;
  gameSlug: string;
  fileSlug: string;
  archetype: string;
  rtpTarget: number;
  minBet: number;
  maxBet: number;
  freebetEnabled: boolean;
  category: string;
  description: string;
}

export interface AiAgentRunQaCheck {
  check: string;
  pass: boolean;
  measured?: string;
  expected?: string;
  routeHint?: 'design' | 'backend' | 'frontend' | 'ambiguous';
}

export interface AiAgentRunRow {
  id: number;
  prompt: string;
  parsedFields: AiAgentRunParsedFields | null;
  overrides: Record<string, unknown> | null;
  phase: AiAgentRunPhase;
  approved: boolean;
  approvalFeedback: string | null;
  retryCount: number;
  lastQaFailureRoute: string | null;
  specDocContent: string | null;
  specDocPath: string | null;
  finalHandoffContent: string | null;
  qaReport: AiAgentRunQaCheck[] | null;
  backendBranch: string | null;
  frontendBranch: string | null;
  backendPrUrl: string | null;
  frontendPrUrl: string | null;
  thumbnailPromptContent: string | null;
  adminPayloadContent: string | null;
  failureReason: string | null;
  triggeredByAdminId: string;
  triggeredByAdminLogin: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  lockedAt: Date | null;
  lockedUntil: Date | null;
  processedBy: string | null;
}

export type AiAgentRunEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'tool_call'
  | 'tool_result'
  | 'gemini_message'
  | 'error'
  | 'retry_routed';
