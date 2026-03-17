'use strict';

/**
 * ProxyQ — QueueManager
 *
 * Handles all queue state in Redis.
 *
 * Data model:
 *   proxyq:queue          → Redis LIST  (FIFO, stores token IDs)
 *   proxyq:token:<id>     → Redis HASH  (position, joinedAt, status)
 *   proxyq:admitted       → Redis SET   (tokens currently allowed through)
 *   proxyq:stats          → Redis HASH  (totalJoined, totalAdmitted, peakQueue)
 */

const QUEUE_KEY      = 'proxyq:queue';
const ADMITTED_KEY   = 'proxyq:admitted';
const STATS_KEY      = 'proxyq:stats';
const TOKEN_PREFIX   = 'proxyq:token:';
const TOKEN_TTL_SECS = 60 * 30; // 30 min — token expires if user closes browser

class QueueManager {
  /**
   * @param {import('ioredis').Redis} redis
   * @param {object} opts
   * @param {number} opts.admitPerInterval  - how many users to admit each tick
   * @param {number} opts.intervalMs        - tick rate in milliseconds
   * @param {number} opts.maxConcurrent     - max users simultaneously on origin
   * @param {Function} opts.onAdmit         - callback(tokenId) when a user is let in
   */
  constructor(redis, opts = {}) {
    this.redis = redis;
    this.admitPerInterval = opts.admitPerInterval ?? 10;
    this.intervalMs       = opts.intervalMs       ?? 2000;
    this.maxConcurrent    = opts.maxConcurrent     ?? 100;
    this.onAdmit          = opts.onAdmit           ?? (() => {});
    this._ticker          = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    if (this._ticker) return;
    this._ticker = setInterval(() => this._tick(), this.intervalMs);
    console.log(`[ProxyQ] Queue engine started — admitting ${this.admitPerInterval} every ${this.intervalMs}ms`);
  }

  stop() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Enqueue a new visitor. Returns their token and position.
   * @returns {{ tokenId: string, position: number, estimatedWaitMs: number }}
   */
  async enqueue(tokenId) {
    const now = Date.now();

    // Add to queue list (right side = back of queue)
    await this.redis.rpush(QUEUE_KEY, tokenId);

    // Store token metadata
    await this.redis.hset(`${TOKEN_PREFIX}${tokenId}`, {
      joinedAt: now,
      status: 'waiting',
    });
    await this.redis.expire(`${TOKEN_PREFIX}${tokenId}`, TOKEN_TTL_SECS);

    // Increment total joined counter
    await this.redis.hincrby(STATS_KEY, 'totalJoined', 1);

    const position = await this.getPosition(tokenId);
    const estimatedWaitMs = this._estimateWait(position);

    // Update peak queue stat
    const queueLen = await this.redis.llen(QUEUE_KEY);
    const peak = parseInt(await this.redis.hget(STATS_KEY, 'peakQueue') || '0');
    if (queueLen > peak) {
      await this.redis.hset(STATS_KEY, 'peakQueue', queueLen);
    }

    return { tokenId, position, estimatedWaitMs };
  }

  /**
   * Get current 1-based position in queue. Returns 0 if admitted, -1 if not found.
   */
  async getPosition(tokenId) {
    const isAdmitted = await this.redis.sismember(ADMITTED_KEY, tokenId);
    if (isAdmitted) return 0;

    const list = await this.redis.lrange(QUEUE_KEY, 0, -1);
    const idx  = list.indexOf(tokenId);
    return idx === -1 ? -1 : idx + 1;
  }

  /**
   * Check if a token is currently admitted (allowed onto the origin).
   */
  async isAdmitted(tokenId) {
    return !!(await this.redis.sismember(ADMITTED_KEY, tokenId));
  }

  /**
   * Mark a user as done (left the origin). Frees a slot.
   */
  async release(tokenId) {
    await this.redis.srem(ADMITTED_KEY, tokenId);
    await this.redis.del(`${TOKEN_PREFIX}${tokenId}`);
  }

  /**
   * Get a live snapshot of queue state for the admin dashboard.
   */
  async getStats() {
    const [queueLen, admittedCount, stats] = await Promise.all([
      this.redis.llen(QUEUE_KEY),
      this.redis.scard(ADMITTED_KEY),
      this.redis.hgetall(STATS_KEY),
    ]);
    return {
      waiting:        queueLen,
      admitted:       admittedCount,
      availableSlots: Math.max(0, this.maxConcurrent - admittedCount),
      totalJoined:    parseInt(stats?.totalJoined  || '0'),
      totalAdmitted:  parseInt(stats?.totalAdmitted || '0'),
      peakQueue:      parseInt(stats?.peakQueue     || '0'),
    };
  }

  /**
   * Drain and reset the entire queue. Use from admin dashboard.
   */
  async flush() {
    await Promise.all([
      this.redis.del(QUEUE_KEY),
      this.redis.del(ADMITTED_KEY),
    ]);
    console.log('[ProxyQ] Queue flushed by admin.');
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  /**
   * Called every intervalMs. Admits up to admitPerInterval users
   * if there are available slots under maxConcurrent.
   */
  async _tick() {
    try {
      const admittedCount = await this.redis.scard(ADMITTED_KEY);
      const availableSlots = this.maxConcurrent - admittedCount;
      if (availableSlots <= 0) return;

      const toAdmit = Math.min(availableSlots, this.admitPerInterval);

      for (let i = 0; i < toAdmit; i++) {
        // Pop from front of queue (left side = front)
        const tokenId = await this.redis.lpop(QUEUE_KEY);
        if (!tokenId) break; // Queue is empty

        // Move token to admitted set
        await this.redis.sadd(ADMITTED_KEY, tokenId);
        await this.redis.hset(`${TOKEN_PREFIX}${tokenId}`, 'status', 'admitted');
        await this.redis.hincrby(STATS_KEY, 'totalAdmitted', 1);

        // Notify the WebSocket layer
        this.onAdmit(tokenId);
      }
    } catch (err) {
      console.error('[ProxyQ] Tick error:', err.message);
    }
  }

  /**
   * Rough wait estimate based on position and admit rate.
   */
  _estimateWait(position) {
    const ticksNeeded = Math.ceil(position / this.admitPerInterval);
    return ticksNeeded * this.intervalMs;
  }
}

module.exports = { QueueManager };