'use strict';

/**
 * ProxyQ — Dashboard server
 *
 * Exposes:
 *   GET  /              → admin dashboard HTML
 *   GET  /api/stats     → current queue snapshot (JSON)
 *   POST /api/pause     → pause admission (stop the queue ticker)
 *   POST /api/resume    → resume admission
 *   POST /api/flush     → drain the entire queue
 *   POST /api/config    → hot-update maxConcurrent / admitPerInterval
 *   WS   /live          → push stats every second to dashboard
 *
 * Designed to be mounted alongside the core ProxyQ server.
 * Protected by a simple Bearer token (PROXYQ_ADMIN_TOKEN env var).
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const { dashboardHtml } = require('./ui');

const STATS_PUSH_MS = 1000;

class DashboardServer {
  /**
   * @param {object} opts
   * @param {number} opts.port
   * @param {string} opts.adminToken        - Bearer token for auth
   * @param {import('ioredis').Redis} opts.redis
   * @param {import('../../core/src/queue').QueueManager} opts.queue
   */
  constructor(opts) {
    this.port       = opts.port       ?? 3002;
    this.adminToken = opts.adminToken ?? process.env.PROXYQ_ADMIN_TOKEN ?? 'changeme';
    this.redis      = opts.redis;
    this.queue      = opts.queue;
    this._paused    = false;
    this._server    = null;
    this._wss       = null;
    this._ticker    = null;
    this._history   = []; // rolling 60-point history for sparklines
  }

  start() {
    this._server = http.createServer((req, res) => this._handleHttp(req, res));
    this._wss    = new WebSocketServer({ server: this._server });

    this._wss.on('connection', (ws, req) => {
      if (!this._authWs(req)) { ws.close(4001, 'Unauthorized'); return; }
      // Push stats immediately on connect
      this._pushStats(ws);
    });

    // Push stats to all dashboard clients every second
    this._ticker = setInterval(() => this._broadcastStats(), STATS_PUSH_MS);

    this._server.listen(this.port, () => {
      console.log(`[ProxyQ Dashboard] http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this._ticker) clearInterval(this._ticker);
    this._wss?.close();
    this._server?.close();
  }

  // ─── HTTP ─────────────────────────────────────────────────────────────────

  async _handleHttp(req, res) {
    const url = req.url.split('?')[0];

    // Serve dashboard UI (no auth — token is embedded in the page)
    if (req.method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml({ port: this.port, token: this.adminToken }));
      return;
    }

    // All API routes require auth
    if (!this._authHttp(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (req.method === 'GET' && url === '/api/stats') {
      const stats = await this.queue.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...stats, paused: this._paused, history: this._history }));
      return;
    }

    if (req.method === 'POST' && url === '/api/pause') {
      this.queue.stop();
      this._paused = true;
      console.log('[ProxyQ Dashboard] Queue paused by admin.');
      res.writeHead(200); res.end(JSON.stringify({ ok: true, paused: true }));
      return;
    }

    if (req.method === 'POST' && url === '/api/resume') {
      this.queue.start();
      this._paused = false;
      console.log('[ProxyQ Dashboard] Queue resumed by admin.');
      res.writeHead(200); res.end(JSON.stringify({ ok: true, paused: false }));
      return;
    }

    if (req.method === 'POST' && url === '/api/flush') {
      await this.queue.flush();
      this._history = [];
      console.log('[ProxyQ Dashboard] Queue flushed by admin.');
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && url === '/api/config') {
      const body = await this._readBody(req);
      const cfg  = JSON.parse(body);
      if (cfg.maxConcurrent)    this.queue.maxConcurrent    = parseInt(cfg.maxConcurrent);
      if (cfg.admitPerInterval) this.queue.admitPerInterval = parseInt(cfg.admitPerInterval);
      if (cfg.intervalMs) {
        this.queue.stop();
        this.queue.intervalMs = parseInt(cfg.intervalMs);
        if (!this._paused) this.queue.start();
      }
      console.log('[ProxyQ Dashboard] Config updated:', cfg);
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404); res.end('Not found');
  }

  // ─── WebSocket broadcast ──────────────────────────────────────────────────

  async _broadcastStats() {
    if (this._wss.clients.size === 0) return;
    const stats = await this._buildStats();
    const msg   = JSON.stringify(stats);
    for (const ws of this._wss.clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }

  async _pushStats(ws) {
    const stats = await this._buildStats();
    ws.send(JSON.stringify(stats));
  }

  async _buildStats() {
    const stats = await this.queue.getStats();
    // Keep 60-point rolling history (1 per second = last 60s)
    this._history.push({ t: Date.now(), waiting: stats.waiting, admitted: stats.admitted });
    if (this._history.length > 60) this._history.shift();
    return { ...stats, paused: this._paused, history: this._history };
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  _authHttp(req) {
    const header = req.headers['authorization'] || '';
    return header === `Bearer ${this.adminToken}`;
  }

  _authWs(req) {
    const url   = new URL(req.url, `http://localhost:${this.port}`);
    return url.searchParams.get('token') === this.adminToken;
  }

  // ─── Util ─────────────────────────────────────────────────────────────────

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', c => data += c);
      req.on('end',  () => resolve(data));
      req.on('error', reject);
    });
  }
}

// Standalone mode
if (require.main === module) {
  const Redis = require('ioredis');
  const { QueueManager } = require('../core/src/queue');

  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
  });

  const queue = new QueueManager(redis, {
    maxConcurrent:    parseInt(process.env.PROXYQ_MAX_CONCURRENT    ?? '100'),
    admitPerInterval: parseInt(process.env.PROXYQ_ADMIT_PER_INTERVAL ?? '10'),
    intervalMs:       parseInt(process.env.PROXYQ_INTERVAL_MS        ?? '2000'),
  });

  const dashboard = new DashboardServer({
    port:       parseInt(process.env.PROXYQ_DASHBOARD_PORT ?? '3002'),
    adminToken: process.env.PROXYQ_ADMIN_TOKEN ?? 'changeme',
    redis,
    queue,
  });

  dashboard.start();
}

module.exports = { DashboardServer };
