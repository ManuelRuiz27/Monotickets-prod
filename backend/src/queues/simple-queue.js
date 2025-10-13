import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { ensureRedis } from '../redis/client.js';

const STATUS_WAITING = 'waiting';
const STATUS_ACTIVE = 'active';
const STATUS_COMPLETED = 'completed';
const STATUS_FAILED = 'failed';

function toKey(name, suffix) {
  return `sq:${name}:${suffix}`;
}

export class SimpleQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.connectionOptions = options.connectionOptions || {};
    this.defaultJobOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
      ...options.defaultJobOptions,
    };
    this.logger = options.logger || ((payload) => console.log(JSON.stringify(payload)));
  }

  async add(jobName, data, opts = {}) {
    const jobId = opts.jobId || randomUUID();
    const attempts = Number(opts.attempts ?? this.defaultJobOptions.attempts);
    const backoff = opts.backoff || this.defaultJobOptions.backoff;
    const removeOnComplete = opts.removeOnComplete ?? this.defaultJobOptions.removeOnComplete;
    const removeOnFail = opts.removeOnFail ?? this.defaultJobOptions.removeOnFail;
    const timestamp = Date.now();
    const delayMs = Number(opts.delay || 0);

    const job = {
      id: jobId,
      name: jobName,
      data,
      opts: { attempts, backoff, removeOnComplete, removeOnFail, timestamp, delay: delayMs },
      status: STATUS_WAITING,
      attemptsMade: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-producer` });
    const jobKey = toKey(this.name, `job:${jobId}`);
    await client.hset(jobKey, {
      id: job.id,
      name: job.name,
      data: JSON.stringify(job.data),
      opts: JSON.stringify(job.opts),
      status: job.status,
      attemptsMade: job.attemptsMade,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
    await client.expire(jobKey, Number(this.options.jobTtlSeconds || 7 * 24 * 60 * 60));

    if (delayMs > 0) {
      await client.zadd(toKey(this.name, 'delayed'), timestamp + delayMs, job.id);
    } else {
      await client.zadd(toKey(this.name, 'waiting'), timestamp, job.id);
    }

    this.logger({
      level: 'info',
      message: 'queue_job_added',
      queue: this.name,
      job_id: job.id,
      delay_ms: delayMs,
      attempts,
      enqueued_at: timestamp,
    });

    return job;
  }

  async countWaiting() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-metrics` });
    return client.zcard(toKey(this.name, 'waiting'));
  }

  async countDelayed() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-metrics` });
    return client.zcard(toKey(this.name, 'delayed'));
  }

  async countActive() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-metrics` });
    return client.zcard(toKey(this.name, 'active'));
  }

  async countCompleted() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-metrics` });
    return client.llen(toKey(this.name, 'completed'));
  }

  async countFailed() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-metrics` });
    return client.llen(toKey(this.name, 'failed'));
  }

  async countDeadLetter() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-metrics` });
    return client.llen(toKey(this.name, 'dlq'));
  }
}

export class SimpleQueueEvents extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.connectionOptions = options.connectionOptions || {};
    this.pollIntervalMs = Number(options.pollIntervalMs || 1000);
    this.running = false;
    this._poll = this._poll.bind(this);
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this._poll();
  }

  stop() {
    this.running = false;
  }

  async _poll() {
    if (!this.running) return;
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-events` });
    const failedKey = toKey(this.name, 'failed');
    const completedKey = toKey(this.name, 'completed');
    const dlqKey = toKey(this.name, 'dlq');

    const failedId = await client.rpop(failedKey);
    if (failedId) {
      const job = await loadJob(this.name, failedId, this.connectionOptions);
      this.emit('failed', { jobId: failedId, job });
    }

    const completedId = await client.rpop(completedKey);
    if (completedId) {
      const job = await loadJob(this.name, completedId, this.connectionOptions);
      this.emit('completed', { jobId: completedId, job });
    }

    const dlqId = await client.rpop(dlqKey);
    if (dlqId) {
      const job = await loadJob(this.name, dlqId, this.connectionOptions);
      this.emit('dead-letter', { jobId: dlqId, job });
    }

    setTimeout(() => this._poll(), this.pollIntervalMs).unref();
  }
}

export class SimpleWorker {
  constructor(name, processor, options = {}) {
    this.name = name;
    this.processor = processor;
    this.options = options;
    this.connectionOptions = options.connectionOptions || {};
    this.concurrency = Number(options.concurrency || 2);
    this.running = false;
    this.logger = options.logger || ((payload) => console.log(JSON.stringify(payload)));
    this.workers = [];
    this.scheduled = false;
  }

  async run() {
    if (this.running) return;
    this.running = true;
    for (let i = 0; i < this.concurrency; i += 1) {
      this.workers.push(this._workLoop(i));
    }
    if (!this.scheduled) {
      this.scheduled = true;
      this._scheduleDelayedProcessor();
    }
  }

  async close() {
    this.running = false;
    await Promise.allSettled(this.workers);
  }

  async _workLoop(slot) {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-worker-${slot}` });
    while (this.running) {
      const jobId = await this._pullJob(client);
      if (!jobId) {
        await delay(200);
        continue;
      }
      await this._processJob(jobId, client);
    }
  }

  async _pullJob(client) {
    const jobTuple = await client.zpopmin(toKey(this.name, 'waiting'));
    if (!jobTuple || jobTuple.length === 0) {
      return null;
    }
    const id = Array.isArray(jobTuple) ? jobTuple[0] : jobTuple;
    if (!id) return null;
    await client.zadd(toKey(this.name, 'active'), Date.now(), id);
    return id;
  }

  async _processJob(jobId, client) {
    const job = await loadJob(this.name, jobId, this.connectionOptions);
    if (!job) {
      await client.zrem(toKey(this.name, 'active'), jobId);
      return;
    }
    job.status = STATUS_ACTIVE;
    await saveJob(this.name, job, this.connectionOptions);

    const startedAt = Date.now();
    try {
      await this.processor({
        id: job.id,
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        opts: job.opts,
      });
      const latency = Date.now() - startedAt;
      job.status = STATUS_COMPLETED;
      job.attemptsMade += 1;
      job.updatedAt = Date.now();
      await saveJob(this.name, job, this.connectionOptions);
      await client.zrem(toKey(this.name, 'active'), jobId);
      await client.lpush(toKey(this.name, 'completed'), jobId);
      if (job.opts.removeOnComplete) {
        await deleteJob(this.name, jobId, this.connectionOptions);
      }
      this.logger({
        level: 'info',
        message: 'queue_job_completed',
        queue: this.name,
        job_id: jobId,
        latency_ms: latency,
      });
    } catch (error) {
      await client.zrem(toKey(this.name, 'active'), jobId);
      job.attemptsMade += 1;
      job.status = STATUS_FAILED;
      job.updatedAt = Date.now();
      await saveJob(this.name, job, this.connectionOptions);
      const attempt = job.attemptsMade;
      const maxAttempts = Number(job.opts.attempts || 1);
      this.logger({
        level: 'error',
        message: 'queue_job_failed',
        queue: this.name,
        job_id: jobId,
        attempt,
        max_attempts: maxAttempts,
        error: error.message,
      });
      await client.lpush(toKey(this.name, 'failed'), jobId);
      if (attempt >= maxAttempts) {
        await client.lpush(toKey(this.name, 'dlq'), jobId);
        if (job.opts.removeOnFail) {
          await deleteJob(this.name, jobId, this.connectionOptions);
        }
        return;
      }
      const delayMs = computeBackoff(job.opts.backoff, attempt);
      await client.zadd(toKey(this.name, 'delayed'), Date.now() + delayMs, jobId);
    }
  }

  async _scheduleDelayedProcessor() {
    const client = await ensureRedis({ ...this.connectionOptions, name: `${this.name}-scheduler` });
    const tick = async () => {
      if (!this.running) return;
      const now = Date.now();
      const dueJobIds = await client.zrangebyscore(toKey(this.name, 'delayed'), 0, now);
      if (dueJobIds.length > 0) {
        await client.zremrangebyscore(toKey(this.name, 'delayed'), 0, now);
        for (const jobId of dueJobIds) {
          await client.zadd(toKey(this.name, 'waiting'), now, jobId);
        }
      }
      setTimeout(tick, Number(this.options.schedulerIntervalMs || 1000)).unref();
    };
    tick();
  }
}

async function loadJob(name, jobId, connectionOptions = {}) {
  const client = await ensureRedis({ ...connectionOptions, name: `${name}-loader` });
  const jobKey = toKey(name, `job:${jobId}`);
  const raw = await client.hgetall(jobKey);
  if (!raw || Object.keys(raw).length === 0) {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    data: raw.data ? JSON.parse(raw.data) : {},
    opts: raw.opts ? JSON.parse(raw.opts) : {},
    status: raw.status,
    attemptsMade: Number(raw.attemptsMade || 0),
    createdAt: Number(raw.createdAt || Date.now()),
    updatedAt: Number(raw.updatedAt || Date.now()),
  };
}

async function saveJob(name, job, connectionOptions = {}) {
  const client = await ensureRedis({ ...connectionOptions, name: `${name}-saver` });
  const jobKey = toKey(name, `job:${job.id}`);
  await client.hset(jobKey, {
    id: job.id,
    name: job.name,
    data: JSON.stringify(job.data || {}),
    opts: JSON.stringify(job.opts || {}),
    status: job.status,
    attemptsMade: job.attemptsMade,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}

async function deleteJob(name, jobId, connectionOptions = {}) {
  const client = await ensureRedis({ ...connectionOptions, name: `${name}-deleter` });
  const jobKey = toKey(name, `job:${jobId}`);
  await client.del(jobKey);
}

function computeBackoff(backoff = {}, attempt = 1) {
  if (!backoff) return 0;
  if (typeof backoff === 'number') return backoff * attempt;
  const type = (backoff.type || 'exponential').toLowerCase();
  const delay = Number(backoff.delay || 1000);
  if (type === 'fixed') return delay;
  return delay * 2 ** (attempt - 1);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createSimpleQueue(name, options = {}) {
  const queue = new SimpleQueue(name, options);
  const events = new SimpleQueueEvents(name, options);
  await events.start();
  return { queue, events };
}

export async function createSimpleWorker(name, processor, options = {}) {
  const worker = new SimpleWorker(name, processor, options);
  await worker.run();
  return worker;
}
