import { execSync } from 'child_process';
import { config } from '../config';

const OWNER = 'grishaharutyunyan';
const GIT_AUTHOR_NAME = 'Cherry Game Agents';
const GIT_AUTHOR_EMAIL = 'agents@cherryplay.app';

export interface PublishResult {
  branch: string;
  pushed: boolean;
  prUrl?: string;
  error?: string;
}

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

export class GitPublisherTool {
  /**
   * Resets a working copy to a clean, up-to-date `dev` before a run starts.
   * Generation writes directly into this tree, so any leftover state from a
   * prior aborted/failed run (or a hand-edited file) must never leak into
   * the next job — this is what used to let a single bad run corrupt
   * app.module.ts a little further on every subsequent run.
   */
  static syncDevBranch(repoPath: string, repoLabel: string): void {
    console.log(`🔄 [Git] Syncing ${repoLabel} to latest origin/dev...`);
    run('git fetch origin dev', repoPath);
    run('git checkout dev', repoPath);
    run('git reset --hard origin/dev', repoPath);
    run('git clean -fd', repoPath);
  }

  /**
   * Commits everything currently in the working tree onto a fresh
   * `game/<slug>` branch, pushes it, and opens (or reuses) a PR into dev.
   * Never throws — a publish failure degrades to "code stayed on the VPS,
   * nothing was pushed" instead of crashing the whole pipeline.
   */
  static async publishGameBranch(params: {
    repoPath: string;
    repoName: string; // GitHub repo name, e.g. "game_backend"
    repoLabel: string; // for logging
    gameSlug: string;
    commitTitle: string;
    prBody: string;
  }): Promise<PublishResult> {
    const branch = `game/${params.gameSlug}`;
    const token = config.github.token;

    try {
      if (!token) {
        throw new Error('GITHUB_TOKEN not configured — cannot push or open a PR');
      }

      const status = run('git status --porcelain', params.repoPath);
      if (!status) {
        console.log(`ℹ️ [Git] ${params.repoLabel}: nothing to commit, skipping push/PR.`);
        return { branch, pushed: false, error: 'nothing to commit' };
      }

      run(`git checkout -B ${branch}`, params.repoPath);
      run('git add -A', params.repoPath);
      run(
        `git -c user.name=${JSON.stringify(GIT_AUTHOR_NAME)} -c user.email=${JSON.stringify(GIT_AUTHOR_EMAIL)} commit -m ${JSON.stringify(params.commitTitle)}`,
        params.repoPath,
      );

      const pushUrl = `https://x-access-token:${token}@github.com/${OWNER}/${params.repoName}.git`;
      run(`git push --force ${pushUrl} HEAD:${branch}`, params.repoPath);
      console.log(`✅ [Git] Pushed ${params.repoLabel} branch '${branch}'`);

      const prUrl = await GitPublisherTool.ensurePullRequest({
        repo: params.repoName,
        head: branch,
        base: 'dev',
        title: params.commitTitle,
        body: params.prBody,
        token,
      });

      return { branch, pushed: true, prUrl };
    } catch (err: any) {
      const message = err?.stderr?.toString?.() || err?.message || String(err);
      console.warn(`⚠️ [Git] Failed to publish ${params.repoLabel}: ${message}`);
      return { branch, pushed: false, error: message };
    }
  }

  private static async ensurePullRequest(params: {
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
    token: string;
  }): Promise<string | undefined> {
    const headers = {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
    const apiBase = `https://api.github.com/repos/${OWNER}/${params.repo}`;

    const existingRes = await fetch(
      `${apiBase}/pulls?head=${OWNER}:${params.head}&base=${params.base}&state=open`,
      { headers },
    );
    const existing = await existingRes.json();
    if (existingRes.ok && Array.isArray(existing) && existing.length > 0) {
      console.log(`ℹ️ [Git] PR already open for ${params.head}: ${existing[0].html_url}`);
      return existing[0].html_url;
    }

    const res = await fetch(`${apiBase}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: params.title,
        head: params.head,
        base: params.base,
        body: params.body,
      }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      throw new Error(
        `GitHub PR creation failed (${res.status}): ${data?.message || JSON.stringify(data)}`,
      );
    }
    console.log(`✅ [Git] Opened PR: ${data.html_url}`);
    return data.html_url;
  }
}
