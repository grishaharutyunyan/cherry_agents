import { appendEvent, updateRun } from '../db/runs.repo';
import { AiAgentRunPhase, AiAgentRunQaCheck, AiAgentRunRow } from '../db/types';
import { runBackendBuildPhase } from '../gemini/phases/backend-build.phase';
import { runDesignPhase } from '../gemini/phases/design.phase';
import { runFrontendBuildPhase } from '../gemini/phases/frontend-build.phase';
import { runQaPhase } from '../gemini/phases/qa.phase';
import { AgentEventHandler } from '../gemini/types';
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
      case 'building':
        await handleBuilding(run);
        return;
      case 'qa':
        await handleQa(run);
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
  await appendEvent(run.id, 'parsing', 'phase_started');
  const parsedFields = await parsePrompt(run.prompt, run.overrides);

  if (!parsedFields) {
    const failureReason =
      'Could not confidently determine gameName/rtpTarget/freebetEnabled from the prompt. ' +
      'Re-trigger with a more complete prompt or explicit overrides.';
    await appendEvent(run.id, 'parsing', 'error', { message: failureReason });
    await updateRun(run.id, { phase: 'failed', failureReason, completedAt: new Date() });
    return;
  }

  await appendEvent(run.id, 'parsing', 'phase_completed', { parsedFields });
  await updateRun(run.id, { phase: 'design', parsedFields });
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
    phase: 'awaiting_approval',
    specDocContent: result.specDocContent,
    specDocPath: result.specDocPath,
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

  const [backendResult, frontendResult] = await Promise.allSettled([
    runBackendBuildPhase(run.parsedFields, run.specDocContent, null, makeHandler('backend')),
    runFrontendBuildPhase(run.parsedFields, run.specDocContent, null, makeHandler('frontend')),
  ]);

  if (backendResult.status === 'rejected' || frontendResult.status === 'rejected') {
    const reasons: string[] = [];
    if (backendResult.status === 'rejected') reasons.push(`backend: ${errMsg(backendResult.reason)}`);
    if (frontendResult.status === 'rejected') reasons.push(`frontend: ${errMsg(frontendResult.reason)}`);
    const failureReason = `Building phase failed — never proceeds to QA on half a build. ${reasons.join('; ')}`;
    await appendEvent(run.id, 'building', 'error', { message: failureReason });
    await updateRun(run.id, { phase: 'failed', failureReason, completedAt: new Date() });
    return;
  }

  await appendEvent(run.id, 'building', 'phase_completed', {
    backendBranch: backendResult.value.branch,
    frontendBranch: frontendResult.value.branch,
  });
  await updateRun(run.id, {
    phase: 'qa',
    backendBranch: backendResult.value.branch,
    frontendBranch: frontendResult.value.branch,
  });
}

async function handleQa(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields || !run.specDocContent || !run.backendBranch || !run.frontendBranch) {
    throw new Error('QA phase reached with missing prerequisites (parsedFields/specDocContent/backendBranch/frontendBranch)');
  }
  await appendEvent(run.id, 'qa', 'phase_started');
  const onEvent: AgentEventHandler = (event) => appendEvent(run.id, 'qa', event.type, event.detail as Record<string, unknown>);

  const result = await runQaPhase(run.parsedFields, run.specDocContent, run.backendBranch, run.frontendBranch, onEvent);

  await appendEvent(run.id, 'qa', 'phase_completed', {
    overallPass: result.overallPass,
    summary: result.summary,
    checks: result.checks,
  });

  if (result.overallPass) {
    await updateRun(run.id, { phase: 'finalizing', qaReport: result.checks });
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

function summarizeQaFailures(qaReport: AiAgentRunQaCheck[] | null): string {
  if (!qaReport) return 'QA failed (no detail available).';
  const failed = qaReport.filter((c) => !c.pass);
  if (failed.length === 0) return 'QA failed.';
  return failed.map((c) => `- ${c.check}: measured ${c.measured ?? '?'}, expected ${c.expected ?? '?'}`).join('\n');
}

async function handleRetryDesign(run: AiAgentRunRow): Promise<void> {
  if (!run.parsedFields) throw new Error('retry_design reached with no parsedFields');
  await appendEvent(run.id, 'retry_design', 'phase_started');
  const feedback = summarizeQaFailures(run.qaReport);
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
  const feedback = summarizeQaFailures(run.qaReport);
  const routes = (run.lastQaFailureRoute ?? '').split(',').filter(Boolean);
  // No route info (e.g. this retry_build follows a retry_design) or an ambiguous route retries both.
  const retryBackend = routes.length === 0 || routes.includes('backend') || routes.includes('ambiguous');
  const retryFrontend = routes.length === 0 || routes.includes('frontend') || routes.includes('ambiguous');

  const makeHandler = (builder: 'backend' | 'frontend'): AgentEventHandler => (event) =>
    appendEvent(run.id, 'retry_build', event.type, { ...(event.detail as Record<string, unknown>), builder });

  const tasks: Promise<unknown>[] = [];
  if (retryBackend) tasks.push(runBackendBuildPhase(run.parsedFields, run.specDocContent, feedback, makeHandler('backend')));
  if (retryFrontend) tasks.push(runFrontendBuildPhase(run.parsedFields, run.specDocContent, feedback, makeHandler('frontend')));

  const settled = await Promise.allSettled(tasks);
  const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
  if (rejected.length > 0) {
    const failureReason = `Retry build failed — ${rejected.map((r) => errMsg(r.reason)).join('; ')}`;
    await appendEvent(run.id, 'retry_build', 'error', { message: failureReason });
    await updateRun(run.id, { phase: 'failed', failureReason, completedAt: new Date() });
    return;
  }

  await appendEvent(run.id, 'retry_build', 'phase_completed', { retriedBackend: retryBackend, retriedFrontend: retryFrontend });
  await updateRun(run.id, { phase: 'qa' });
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
