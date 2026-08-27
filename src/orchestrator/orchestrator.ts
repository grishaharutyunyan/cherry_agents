import { config } from '../config';
import { appendEvent, updateRun } from '../db/runs.repo';
import { AiAgentRunPhase, AiAgentRunQaCheck, AiAgentRunRow } from '../db/types';
import { runBackendBuildPhase } from '../gemini/phases/backend-build.phase';
import { runDesignPhase } from '../gemini/phases/design.phase';
import { runDesignUxPhase } from '../gemini/phases/design-ux.phase';
import { runFrontendBuildPhase } from '../gemini/phases/frontend-build.phase';
import { runLeadReviewPhase } from '../gemini/phases/lead-review.phase';
import { runQaPhase } from '../gemini/phases/qa.phase';
import { AgentEventHandler } from '../gemini/types';
import { pushBranch } from '../git/repo';
import { parsePrompt } from './parse-prompt';
import { runFinalizePhase } from './finalize';

const MAX_RETRIES = 2;

/**
 * One phase step for one claimed run, per tick. Each handler either advances the run to its
 * next phase or throws — the catch-all below turns any throw into a FAILED run with a recorded
 * reason, so a bug in one phase never leaves a run silently stuck holding its lock forever.
 */
export async function runOnePhaseStep(run: AiAgentRunRow): Promise<void> {
  try {
    switch (run.phase) {
      case 'parsing':
        await handleParsing(run);
        return;
      case 'design':
        await handleDesign(run);
        return;
      case 'design_ux':
        await handleDesignUx(run);
        return;
      case 'building':
        await handleBuilding(run);
        return;
      case 'qa':
        await handleQa(run);
        return;
      case 'lead_review':
        await handleLeadReview(run);
        return;
      case 'retry_design':
        await handleRetryDesign(run);
        return;
      case 'retry_build':
        await handleRetryBuild(run);
        return;
      case 'finalizing':
        await handleFinalizing(run);
        return;
      default:
        await appendEvent(run.id, run.phase, 'error', {
          message: `Phase "${run.phase}" has no implementation`,
        });
        await updateRun(run.id, {
          phase: 'failed',
          failureReason: `Phase "${run.phase}" is not implemented in this build of agents/.`,
          completedAt: new Date(),
        });
    }
  } catch (err) {
    const message = errMsg(err);
    await appendEvent(run.id, run.phase, 'error', { message });
    await updateRun(run.id, { phase: 'failed', failureReason: message, completedAt: new Date() });
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function handleParsing(run: AiAgentRunRow): Promise<void> {
  await appendEvent(run.id, 'parsing', 'phase_started', { revision: Boolean(run.clarificationQuestion) });

  // A prior clarification round left the question on the row and the admin's answer in
  // approvalFeedback (see ai-agent-run.service.ts's clarify() — same reused-field convention as
  // the design-revision flow). Both are consumed here, not carried further.
  const priorClarification =
    run.clarificationQuestion && run.approvalFeedback
      ? { question: run.clarificationQuestion, answer: run.approvalFeedback }
      : null;

  const result = await parsePrompt(run.prompt, run.overrides, priorClarification);

  if (result.status === 'failed') {
    await appendEvent(run.id, 'parsing', 'error', { message: result.reason });
    await updateRun(run.id, { phase: 'failed', failureReason: result.reason, completedAt: new Date() });
    return;
  }

  if (result.status === 'needs_clarification') {
    await appendEvent(run.id, 'parsing', 'phase_completed', { clarificationQuestion: result.question });
    await updateRun(run.id, {
      phase: 'needs_clarification',
      clarificationQuestion: result.question,
      approvalFeedback: null,
    });
    return;
  }

  await appendEvent(run.id, 'parsing', 'phase_completed', { parsedFields: result.fields });
  await updateRun(run.id, {
    phase: 'design',
    parsedFields: result.fields,
    clarificationQuestion: null,
    approvalFeedback: null,
  });
}

async function handleDesign(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields) {
    // Should never happen — parsing always sets parsedFields before advancing to design.
    throw new Error('Design phase reached with no parsedFields');
  }

  await appendEvent(run.id, 'design', 'phase_started', { revision: Boolean(run.approvalFeedback) });
  const onEvent: AgentEventHandler = (event) => appendEvent(run.id, 'design', event.type, event.detail as Record<string, unknown>);

  const result = await runDesignPhase(run.parsedFields, run.approvalFeedback, onEvent);

  await appendEvent(run.id, 'design', 'phase_completed', {
    specDocPath: result.specDocPath,
    reportText: result.reportText,
  });
  await updateRun(run.id, {
    phase: 'design_ux',
    specDocContent: result.specDocContent,
    specDocPath: result.specDocPath,
    approvalFeedback: null,
  });
}

async function handleDesignUx(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent) {
    // Should never happen — parsing always sets parsedFields, and design always sets
    // specDocContent, before advancing to design_ux.
    throw new Error('Design & UX phase reached with no parsedFields/specDocContent');
  }

  await appendEvent(run.id, 'design_ux', 'phase_started');
  const onEvent: AgentEventHandler = (event) => appendEvent(run.id, 'design_ux', event.type, event.detail as Record<string, unknown>);

  const result = await runDesignUxPhase(run.parsedFields, run.specDocContent, run.approvalFeedback, onEvent);

  await appendEvent(run.id, 'design_ux', 'phase_completed', {
    designUxDocPath: result.designUxDocPath,
    designTokensDocPath: result.designTokensDocPath,
    reportText: result.reportText,
  });
  await updateRun(run.id, {
    phase: 'awaiting_approval',
    designUxContent: result.designUxContent,
    designUxDocPath: result.designUxDocPath,
    designTokensContent: result.designTokensContent,
    designTokensDocPath: result.designTokensDocPath,
    approvalFeedback: null,
  });
}

async function handleBuilding(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent) {
    throw new Error('Building phase reached with no parsedFields/specDocContent');
  }
  await appendEvent(run.id, 'building', 'phase_started');

  const makeHandler = (builder: 'backend' | 'frontend'): AgentEventHandler => (event) =>
    appendEvent(run.id, 'building', event.type, { ...(event.detail as Record<string, unknown>), builder });

  // Sequential, not parallel — running both builders concurrently roughly doubles peak Gemini
  // request rate and reliably tripped Vertex AI's rate limit under real load (2026-08-27, even
  // with retry-with-backoff in place). Slower wall-clock, but each attempt is far more likely to
  // actually finish instead of failing on a 429.
  const reasons: string[] = [];
  let backendBranch: string | undefined;
  let frontendBranch: string | undefined;

  try {
    backendBranch = (await runBackendBuildPhase(run.parsedFields, run.specDocContent, null, makeHandler('backend'))).branch;
  } catch (err) {
    reasons.push(`backend: ${errMsg(err)}`);
  }

  try {
    frontendBranch = (
      await runFrontendBuildPhase(
        run.parsedFields,
        run.specDocContent,
        run.designUxContent,
        run.designTokensContent,
        null,
        makeHandler('frontend'),
      )
    ).branch;
  } catch (err) {
    reasons.push(`frontend: ${errMsg(err)}`);
  }

  if (reasons.length > 0) {
    const failureReason = `Building phase failed — never proceeds to QA on half a build. ${reasons.join('; ')}`;
    await appendEvent(run.id, 'building', 'error', { message: failureReason });
    await updateRun(run.id, { phase: 'failed', failureReason, completedAt: new Date() });
    return;
  }

  await appendEvent(run.id, 'building', 'phase_completed', { backendBranch, frontendBranch });
  await updateRun(run.id, { phase: 'qa', backendBranch, frontendBranch });
}

async function handleQa(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent || !run.backendBranch || !run.frontendBranch) {
    throw new Error('QA phase reached with missing prerequisites (parsedFields/specDocContent/backendBranch/frontendBranch)');
  }
  await appendEvent(run.id, 'qa', 'phase_started');
  const onEvent: AgentEventHandler = (event) => appendEvent(run.id, 'qa', event.type, event.detail as Record<string, unknown>);

  const result = await runQaPhase(
    run.parsedFields,
    run.specDocContent,
    run.designTokensContent,
    run.backendBranch,
    run.frontendBranch,
    onEvent,
  );

  await appendEvent(run.id, 'qa', 'phase_completed', {
    overallPass: result.overallPass,
    summary: result.summary,
    checks: result.checks,
  });

  if (result.overallPass) {
    // Push both branches now (before review) so an admin reviewing at the eventual human gate can
    // click through to a real GitHub compare view — finalize.ts pushes again after adding its own
    // commit (games.json + handoff docs), which is a safe no-op push if nothing changed here.
    await pushBranch(config.gameBackendPath, run.backendBranch as string);
    await pushBranch(config.gameFrontendPath, run.frontendBranch as string);
    // Structural QA passing doesn't mean the build actually satisfies what was asked — that
    // semantic judgment is the Lead Orchestrator's job, not QA's. See handleLeadReview.
    await updateRun(run.id, { phase: 'lead_review', qaReport: result.checks });
    return;
  }

  if (run.retryCount >= MAX_RETRIES) {
    const failureReason = `QA failed after ${run.retryCount} retries: ${result.summary}`;
    await updateRun(run.id, { phase: 'failed', qaReport: result.checks, failureReason, completedAt: new Date() });
    return;
  }

  const failedChecks = result.checks.filter((c) => !c.pass);
  const routes = new Set(failedChecks.map((c) => c.routeHint ?? 'ambiguous'));
  const nextPhase: AiAgentRunPhase = routes.has('design') ? 'retry_design' : 'retry_build';

  await appendEvent(run.id, 'qa', 'retry_routed', { routes: [...routes], nextPhase });
  await updateRun(run.id, {
    phase: nextPhase,
    qaReport: result.checks,
    retryCount: run.retryCount + 1,
    lastQaFailureRoute: [...routes].join(','),
  });
}

/**
 * LLM-as-judge supervisor step, runs only after QA has structurally passed (see handleQa's
 * success branch). Where QA checks "is this correct" (RTP math, lint, build, contract shape),
 * this checks "does this actually satisfy what was asked" — a semantic evaluation no deterministic
 * check in this pipeline performs. Approving forwards to the existing human milestone gate
 * (awaiting_finalize_approval) unchanged; rejecting reuses the exact same retry_design/retry_build
 * machinery QA's own failure routing uses, so a Lead-triggered revision goes through the identical
 * revise → rebuild → re-QA → re-review loop, not a parallel mechanism.
 */
async function handleLeadReview(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent || !run.backendBranch || !run.frontendBranch) {
    throw new Error('Lead review phase reached with missing prerequisites (parsedFields/specDocContent/backendBranch/frontendBranch)');
  }
  await appendEvent(run.id, 'lead_review', 'phase_started');
  const onEvent: AgentEventHandler = (event) => appendEvent(run.id, 'lead_review', event.type, event.detail as Record<string, unknown>);

  const qaSummary = run.qaReport?.length
    ? `${run.qaReport.filter((c) => c.pass).length}/${run.qaReport.length} structural checks passed.`
    : 'Structural QA passed.';

  const result = await runLeadReviewPhase(
    run.prompt,
    run.overrides,
    run.parsedFields,
    run.specDocContent,
    run.designUxContent,
    run.designTokensContent,
    qaSummary,
    run.qaReport ?? [],
    run.backendBranch,
    run.frontendBranch,
    onEvent,
  );

  await appendEvent(run.id, 'lead_review', 'phase_completed', { verdict: result.verdict, reasoning: result.reasoning });

  if (result.verdict === 'approve') {
    await updateRun(run.id, { phase: 'awaiting_finalize_approval', leadReviewNotes: result.reasoning });
    return;
  }

  if (run.retryCount >= MAX_RETRIES) {
    // Same principle as the fail-open cases inside lead-review.phase.ts: a strict/wrong verdict
    // must never be the reason a run dies once the automated budget is spent — forward to the
    // human gate with the concern attached instead of failing outright.
    await appendEvent(run.id, 'lead_review', 'retry_routed', { note: 'retries exhausted, forwarding to human review anyway' });
    await updateRun(run.id, {
      phase: 'awaiting_finalize_approval',
      leadReviewNotes:
        `Lead Orchestrator flagged a semantic-fit concern but the automated retry budget is exhausted — forwarding for your review.\n\n${result.reasoning}` +
        (result.revisionNotes ? `\n\nSuggested revision: ${result.revisionNotes}` : ''),
    });
    return;
  }

  const nextPhase: AiAgentRunPhase = result.routeHint === 'design' ? 'retry_design' : 'retry_build';
  await appendEvent(run.id, 'lead_review', 'retry_routed', { routeHint: result.routeHint, nextPhase });
  await updateRun(run.id, {
    phase: nextPhase,
    leadReviewNotes: result.reasoning,
    // Reused by handleRetryDesign/handleRetryBuild as the actual feedback text — same convention
    // as a human rejection at the finalize-approval gate (see handleRetryBuild's comment below).
    approvalFeedback: result.revisionNotes ?? result.reasoning,
    retryCount: run.retryCount + 1,
    lastQaFailureRoute: result.routeHint ?? 'ambiguous',
  });
}

function summarizeQaFailures(qaReport: AiAgentRunQaCheck[] | null): string {
  if (!qaReport) return 'QA failed (no detail available).';
  const failed = qaReport.filter((c) => !c.pass);
  if (failed.length === 0) return 'QA failed.';
  return failed.map((c) => `- ${c.check}: measured ${c.measured ?? '?'}, expected ${c.expected ?? '?'}`).join('\n');
}

async function handleRetryDesign(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields) throw new Error('retry_design reached with no parsedFields');
  await appendEvent(run.id, 'retry_design', 'phase_started');
  // Prefer explicit feedback (a human rejection, or the Lead Orchestrator's revisionNotes — both
  // land in approvalFeedback, see handleLeadReview/ai-agent-run.service.ts's approve()) over
  // deriving text from qaReport, which only reflects QA's structural findings and would be stale
  // or misleading here (QA passed — that's why lead_review ran at all) when a Lead rejection is
  // what triggered this retry. Same precedence handleRetryBuild already uses.
  const feedback = run.approvalFeedback ?? summarizeQaFailures(run.qaReport);
  const onEvent: AgentEventHandler = (event) => appendEvent(run.id, 'retry_design', event.type, event.detail as Record<string, unknown>);

  const result = await runDesignPhase(run.parsedFields, feedback, onEvent);

  await appendEvent(run.id, 'retry_design', 'phase_completed', { specDocPath: result.specDocPath });
  // Both builders re-run against the revised spec next, same as create-game.md's retry loop —
  // no re-approval gate on a QA-driven retry, only on the initial design.
  await updateRun(run.id, {
    phase: 'retry_build',
    specDocContent: result.specDocContent,
    specDocPath: result.specDocPath,
  });
}

async function handleRetryBuild(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent) {
    throw new Error('retry_build reached with missing parsedFields/specDocContent');
  }
  await appendEvent(run.id, 'retry_build', 'phase_started');
  // A human rejection at the finalize-approval gate leaves approvalFeedback set and
  // lastQaFailureRoute cleared (see cherry_admin_backend's approve()) — prefer that over an
  // automated QA finding when both could theoretically be present.
  const feedback = run.approvalFeedback ?? summarizeQaFailures(run.qaReport);
  const routes = (run.lastQaFailureRoute ?? '').split(',').filter(Boolean);
  // No route info, an ambiguous route, or a route of exactly "design" all retry both builders —
  // "design" means the spec itself just changed underneath both of them (neither builder's code
  // has been touched to match the revision yet), so skipping either one here would leave it built
  // against a stale spec. (A route set that mixes "design" with "backend" or "frontend" already
  // retries both anyway, via the .includes checks below — this only matters for a pure "design" route.)
  const retryBackend = routes.length === 0 || routes.includes('backend') || routes.includes('ambiguous') || routes.includes('design');
  const retryFrontend = routes.length === 0 || routes.includes('frontend') || routes.includes('ambiguous') || routes.includes('design');

  const makeHandler = (builder: 'backend' | 'frontend'): AgentEventHandler => (event) =>
    appendEvent(run.id, 'retry_build', event.type, { ...(event.detail as Record<string, unknown>), builder });

  // Sequential, not parallel — see handleBuilding's identical rationale.
  const reasons: string[] = [];
  if (retryBackend) {
    try {
      await runBackendBuildPhase(run.parsedFields, run.specDocContent, feedback, makeHandler('backend'));
    } catch (err) {
      reasons.push(`backend: ${errMsg(err)}`);
    }
  }
  if (retryFrontend) {
    try {
      await runFrontendBuildPhase(
        run.parsedFields,
        run.specDocContent,
        run.designUxContent,
        run.designTokensContent,
        feedback,
        makeHandler('frontend'),
      );
    } catch (err) {
      reasons.push(`frontend: ${errMsg(err)}`);
    }
  }

  if (reasons.length > 0) {
    const failureReason = `Retry build failed — ${reasons.join('; ')}`;
    await appendEvent(run.id, 'retry_build', 'error', { message: failureReason });
    await updateRun(run.id, { phase: 'failed', failureReason, completedAt: new Date() });
    return;
  }

  await appendEvent(run.id, 'retry_build', 'phase_completed', { retriedBackend: retryBackend, retriedFrontend: retryFrontend });
  await updateRun(run.id, { phase: 'qa', approvalFeedback: null });
}

async function handleFinalizing(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent || !run.backendBranch || !run.frontendBranch) {
    throw new Error('Finalizing phase reached with missing prerequisites');
  }
  await appendEvent(run.id, 'finalizing', 'phase_started');
  const qaSummary = run.qaReport?.length ? `${run.qaReport.filter((c) => c.pass).length}/${run.qaReport.length} checks passed.` : 'All QA checks passed.';

  const result = await runFinalizePhase(
    run.parsedFields,
    run.specDocContent,
    run.designUxContent,
    run.leadReviewNotes,
    run.qaReport ?? [],
    qaSummary,
    run.backendBranch,
    run.frontendBranch,
  );

  await appendEvent(run.id, 'finalizing', 'phase_completed', {
    backendPrUrl: result.backendPrUrl,
    frontendPrUrl: result.frontendPrUrl,
  });
  await updateRun(run.id, {
    phase: 'done',
    finalHandoffContent: result.finalHandoffContent,
    thumbnailPromptContent: result.thumbnailPromptContent,
    adminPayloadContent: result.adminPayloadContent,
    backendPrUrl: result.backendPrUrl,
    frontendPrUrl: result.frontendPrUrl,
    completedAt: new Date(),
  });
}
