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
