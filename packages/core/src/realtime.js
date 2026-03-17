'use strict';

/**
 * ProxyQ — WebSocket server
 *
 * Each waiting user connects here and receives live updates:
 *   { type: 'position', position: 42, estimatedWaitMs: 8400 }
 *   { type: 'admitted' }
 *   { type: 'error', message: '...' }
 *
 * The QueueManager calls notifyAdmitted(tokenId) when a user is let through.
 * A background interval pushes position updates to all connected clients.
 */

const { WebSocketServer } = require('ws');

const UPDATE_INTERVAL_MS = 3000; // push position updates every 3s

class RealtimeServer {
  /**
   * @param {object} opts
   * @param {number}               opts.port         - WS server port
   * @param {import('./queue').QueueManager} opts.queue
   */
  constructor(opts) {
    this.port   = opts.port ?? 3001;
    this.queue  = opts.queue;

    // Map of tokenId → WebSocket client
    this._clients = new Map();
    this._wss     = null;
    this._ticker  = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    this._wss = new WebSocketServer({ port: this.port });

    this._wss.on('connection', (ws, req) => {
      const tokenId = this._extractToken(req);
      if (!tokenId) {
        ws.close(4001, 'Missing token');
        return;
      }

      this._clients.set(tokenId, ws);
      console.log(`[ProxyQ WS] Client connected — token: ${tokenId.slice(0, 8)}...`);

      ws.on('close', () => {
        this._clients.delete(tokenId);
        console.log(`[ProxyQ WS] Client disconnected — token: ${tokenId.slice(0, 8)}...`);
      });

      ws.on('error', (err) => {
        console.error(`[ProxyQ WS] Client error:`, err.message);
      });

      // Send initial position immediately on connect
      this._sendPosition(tokenId, ws);
    });

    // Periodically push position updates to all waiting clients
    this._ticker = setInterval(() => this._broadcastPositions(), UPDATE_INTERVAL_MS);

    console.log(`[ProxyQ WS] Realtime server listening on ws://localhost:${this.port}`);
  }

  stop() {
    if (this._ticker) clearInterval(this._ticker);
    if (this._wss)    this._wss.close();
  }

  // ─── Called by QueueManager ───────────────────────────────────────────────

  /**
   * Immediately notify a specific token that they've been admitted.
   */
  notifyAdmitted(tokenId) {
    const ws = this._clients.get(tokenId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'admitted' }));
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  async _broadcastPositions() {
    if (this._clients.size === 0) return;

    for (const [tokenId, ws] of this._clients.entries()) {
      if (ws.readyState === ws.OPEN) {
        await this._sendPosition(tokenId, ws);
      }
    }
  }

  async _sendPosition(tokenId, ws) {
    try {
      const position = await this.queue.getPosition(tokenId);

      if (position === 0) {
        // Already admitted — shouldn't be on WS anymore but handle gracefully
        ws.send(JSON.stringify({ type: 'admitted' }));
        return;
      }

      if (position === -1) {
        ws.send(JSON.stringify({ type: 'error', message: 'Token not found in queue.' }));
        ws.close();
        return;
      }

      const estimatedWaitMs = this.queue._estimateWait(position);
      ws.send(JSON.stringify({ type: 'position', position, estimatedWaitMs }));
    } catch (err) {
      console.error('[ProxyQ WS] Error sending position:', err.message);
    }
  }

  _extractToken(req) {
    // Token passed as query param: ws://host:3001/?token=<uuid>
    const url    = new URL(req.url, `http://localhost:${this.port}`);
    return url.searchParams.get('token') || null;
  }
}

module.exports = { RealtimeServer };