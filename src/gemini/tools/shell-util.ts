import { execFile } from 'child_process';
import { promisify } from 'util';

export const execFileAsync = promisify(execFile);

export function truncate(s: string, max = 8000): string {
  return s.length > max ? `${s.slice(0, max)}\n...[truncated ${s.length - max} chars]` : s;
}

export interface ShellExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * For a run_shell `requireToolCall.matches` predicate — true only for a `git commit` call whose
 * execution actually succeeded (exitCode 0), not merely attempted (e.g. rejected by the
 * commit-msg hook) or a same-tool call for something else (`git status`, `npm run lint`). Mirrors
 * run-shell.tool.ts's own command+args normalization so a model that collapses "git commit" into
 * a single `command` string is still detected correctly.
 */
export function isSuccessfulGitCommit(args: Record<string, unknown>, result: unknown): boolean {
  const commandParts = String(args.command ?? '').split(/\s+/).filter(Boolean);
  const argv = [...commandParts.slice(1), ...(Array.isArray(args.args) ? args.args.map(String) : [])];
  const isGitCommit = commandParts[0] === 'git' && argv[0] === 'commit';
  const succeeded = typeof result === 'object' && result !== null && (result as Partial<ShellExecResult>).exitCode === 0;
  return isGitCommit && succeeded;
}

/** Runs `bin args` via execFile (argv array, never a shell string — no shell metacharacter risk). */
export async function runExecFile(bin: string, args: string[], cwd: string, timeoutMs: number): Promise<ShellExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    return { exitCode: 0, stdout: truncate(stdout), stderr: truncate(stderr) };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: truncate(e.stdout ?? ''),
      stderr: truncate(e.stderr ?? e.message ?? String(err)),
    };
  }
}
