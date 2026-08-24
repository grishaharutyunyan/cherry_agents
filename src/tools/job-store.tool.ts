import Redis from 'ioredis';
import { config } from '../config';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AgentJob {
  id: string;
  prompt: string;
  status: JobStatus;
  currentStep: number;
  totalSteps: number;
  logs: string[];
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const KEY_PREFIX = 'agent_job:';

/**
 * Persists game-generation pipeline runs in Redis so the admin panel can poll
 * status/logs instead of holding one long-lived HTTP request open, and so a
 * PM2 restart or redeploy mid-run doesn't silently lose the run's state.
 */
export class JobStoreTool {
  private static client: Redis | null = null;

  private static getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(config.redis.url, { db: config.redis.db, maxRetriesPerRequest: 2 });
      this.client.on('error', (err) => console.error('❌ [JobStore] Redis error:', err.message));
    }
    return this.client;
  }

  static async createJob(id: string, prompt: string, totalSteps: number): Promise<AgentJob> {
    const job: AgentJob = {
      id,
      prompt,
      status: 'queued',
      currentStep: 0,
      totalSteps,
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.save(job);
    return job;
  }

  static async getJob(id: string): Promise<AgentJob | null> {
    const raw = await this.getClient().get(`${KEY_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as AgentJob) : null;
  }

  static async updateJob(id: string, patch: Partial<AgentJob>): Promise<AgentJob | null> {
    const job = await this.getJob(id);
    if (!job) return null;
    const updated: AgentJob = { ...job, ...patch, updatedAt: new Date().toISOString() };
    await this.save(updated);
    return updated;
  }

  static async appendLog(id: string, line: string): Promise<void> {
    const job = await this.getJob(id);
    if (!job) return;
    job.logs.push(line);
    job.updatedAt = new Date().toISOString();
    await this.save(job);
  }

  private static async save(job: AgentJob): Promise<void> {
    await this.getClient().set(`${KEY_PREFIX}${job.id}`, JSON.stringify(job), 'EX', config.job.ttlSeconds);
  }
}
