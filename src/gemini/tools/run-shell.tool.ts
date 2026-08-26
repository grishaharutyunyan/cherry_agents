import { AgentTool } from '../types';
import { runExecFile } from './shell-util';

/**
 * Not a general shell — `command`/`args` are passed straight to execFile (argv array,
 * no shell interpretation, no pipes/redirects/globs), and the resulting argv must match one
 * of `allowed`'s prefixes exactly. This is the real security boundary for a phase, same as
 * write_file's allowedRoots — enforced here, not just described in the system prompt.
 */
export function makeRunShellTool(name: string, cwd: string, allowed: string[][], timeoutMs = 5 * 60 * 1000): AgentTool {
  return {
    declaration: {
      name,
      description:
        `Run an allowlisted command with cwd pinned to this phase's working directory. ` +
        `Allowed (as argv prefixes, extra trailing args are passed through): ` +
        `${allowed.map((a) => a.join(' ')).join(' | ')}.`,
      parametersJsonSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
        },
        required: ['command'],
      },
    },
    execute: async (args) => {
      // The model sometimes collapses the whole command line into `command` as one string
      // instead of splitting it into command+args (real precedent: "git status", "npm run lint"
      // sent as a single `command` value, repeatedly, rejected every time even though "git
      // status" is allowlisted — the model gave up on investigating a real build failure because
      // of this, not because the command was actually disallowed). Always split `command` on
      // whitespace and merge any extra tokens into argv before matching — a normal single-word
      // command like "git" is unaffected, and the allowlist check below still runs against the
      // resulting real argv array, so this doesn't loosen the actual security boundary.
      const commandParts = String(args.command ?? '').split(/\s+/).filter(Boolean);
      const command = commandParts[0] ?? '';
      const argv = [...commandParts.slice(1), ...(Array.isArray(args.args) ? args.args.map(String) : [])];
      const full = [command, ...argv];
      const isAllowed = allowed.some((prefix) => prefix.every((p, i) => full[i] === p));
      if (!isAllowed) {
        return { error: `Command not allowlisted for this tool: ${full.join(' ')}` };
      }
      return runExecFile(command, argv, cwd, timeoutMs);
    },
  };
}
