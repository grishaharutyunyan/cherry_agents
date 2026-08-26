import { appendEvent, updateRun } from '../db/runs.repo';
import { AiAgentRunRow } from '../db/types';
import { AgentEventHandler } from '../gemini/types';
import { runDesignPhase } from '../gemini/phases/design.phase';
import { parsePrompt } from './parse-prompt';

/**
 * One phase step for one claimed run, per tick. Each handler either advances the run to its
 * next phase or throws — the catch-all below turns any throw into a FAILED run with a recorded
 * reason, so a bug in one phase never leaves a run silently stuck holding its lock forever.
 *
 * M2 scope: parsing and design are real. building is a deterministic stub straight to done, so
 * the approval gate can be verified end-to-end before M3 adds the real backend/frontend builder
 * agents. qa/retry_design/retry_build/finalizing are unreachable via the normal flow this
 * milestone (building stubs past them) but are still reachable via the admin's manual /retry
 * escape hatch — the default case below fails loudly rather than spinning silently.
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
        await handleBuildingStub(run);
        return;
      default:
        await appendEvent(run.id, run.phase, 'error', {
          message: `Phase "${run.phase}" has no implementation yet (lands in a later milestone)`,
        });
        await updateRun(run.id, {
          phase: 'failed',
          failureReason: `Phase "${run.phase}" is not implemented yet in this build of agents/.`,
          completedAt: new Date(),
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendEvent(run.id, run.phase, 'error', { message });
    await updateRun(run.id, { phase: 'failed', failureReason: message, completedAt: new Date() });
  }
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

/**
 * TODO(M3): replace with real parallel backend-build.phase.ts + frontend-build.phase.ts
 * dispatch. For M2 this only exists to prove the awaiting_approval → building transition
 * (i.e. the admin approve endpoint) actually unparks a run end-to-end.
 */
async function handleBuildingStub(run: AiAgentRunRow): Promise<void> {
  await appendEvent(run.id, 'building', 'phase_started', {
    note: 'M2 stub — real backend/frontend builder agents land in M3',
  });
  await appendEvent(run.id, 'building', 'phase_completed', {
    note: 'M2 stub: skipping straight to done to verify the approval gate unparked correctly',
  });
  await updateRun(run.id, { phase: 'done', completedAt: new Date() });
}
