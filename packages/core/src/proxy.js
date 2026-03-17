'use strict';

/**
 * ProxyQ — ProxyServer
 *
 * Sits in front of the origin server. Every incoming request is checked:
 *
 *   1. Does the request have a valid admitted token cookie?
 *      YES → forward to origin (transparent proxy)
 *      NO  → is there a waiting token cookie?
 *              YES → serve the waiting room page (user is still in queue)
 *              NO  → assign a new token, enqueue, serve waiting room
 *
 * Cookie: proxyq_token=<uuid>  (httpOnly, SameSite=Strict)
 */

const http      = require('http');
const httpProxy = require('http-proxy');
const { v4: uuidv4 } = require('uuid');

const COOKIE_NAME    = 'proxyq_token';
const COOKIE_MAX_AGE = 60 * 30; // 30 minutes

class ProxyServer {
  /**
   * @param {object} opts
   * @param {number}               opts.port          - port to listen on
   * @param {string}               opts.origin        - origin URL e.g. http://localhost:8080
   * @param {string}               opts.wsUrl         - WebSocket server URL for waiting room
   * @param {import('./queue').QueueManager}  opts.queue
   * @param {Function}             opts.getWaitingRoomHtml - fn(token) → HTML string
   */
  constructor(opts) {
    this.port               = opts.port ?? 3000;
    this.origin             = opts.origin;
    this.wsUrl              = opts.wsUrl ?? 'ws://localhost:3001';
    this.queue              = opts.queue;
    this.getWaitingRoomHtml = opts.getWaitingRoomHtml;

    this._proxy  = httpProxy.createProxyServer({});
    this._server = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    this._server = http.createServer((req, res) => this._handle(req, res));

    this._proxy.on('error', (err, req, res) => {
      console.error('[ProxyQ] Proxy error:', err.message);
      res.writeHead(502);
      res.end('ProxyQ: origin server unreachable.');
    });

    this._server.listen(this.port, () => {
      console.log(`[ProxyQ] Proxy listening on http://localhost:${this.port}`);
      console.log(`[ProxyQ] Forwarding admitted traffic to: ${this.origin}`);
    });
  }

  stop() {
    this._server?.close();
    this._proxy.close();
  }

  // ─── Request handler ──────────────────────────────────────────────────────

  async _handle(req, res) {
    // Health check — used by Docker / load balancers
    if (req.url === '/__proxyq/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const stats = await this.queue.getStats();
      res.end(JSON.stringify({ status: 'ok', ...stats }));
      return;
    }

    // Release endpoint — called by origin's logout / session end page
    if (req.url === '/__proxyq/release') {
      const tokenId = this._getTokenFromCookie(req);
      if (tokenId) await this.queue.release(tokenId);
      this._clearCookie(res);
      res.writeHead(200);
      res.end('released');
      return;
    }

    const tokenId = this._getTokenFromCookie(req);

    // ── Case 1: User has a token — check if admitted ──
    if (tokenId) {
      const admitted = await this.queue.isAdmitted(tokenId);

      if (admitted) {
        // Forward to origin — transparent, no latency added
        this._proxy.web(req, res, { target: this.origin });
        return;
      }

      // Still waiting — serve waiting room (position will come via WS)
      const position = await this.queue.getPosition(tokenId);
      if (position === -1) {
        // Token expired or invalid — re-enqueue
        await this._enqueueAndRespond(req, res);
        return;
      }

      this._serveWaitingRoom(res, tokenId, position);
      return;
    }

    // ── Case 2: No token — new visitor ──
    await this._enqueueAndRespond(req, res);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async _enqueueAndRespond(req, res) {
    const tokenId = uuidv4();
    const { position, estimatedWaitMs } = await this.queue.enqueue(tokenId);

    this._setCookie(res, tokenId);

    // If position is 0 they were immediately admitted (queue was empty)
    if (position === 0) {
      // Redirect to self — next request will proxy through
      res.writeHead(302, { Location: req.url || '/' });
      res.end();
      return;
    }

    this._serveWaitingRoom(res, tokenId, position, estimatedWaitMs);
  }

  _serveWaitingRoom(res, tokenId, position, estimatedWaitMs) {
    const html = this.getWaitingRoomHtml({ tokenId, position, estimatedWaitMs, wsUrl: this.wsUrl });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  _getTokenFromCookie(req) {
    const header = req.headers.cookie || '';
    const match  = header.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
    return match ? match[1] : null;
  }

  _setCookie(res, tokenId) {
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${tokenId}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict`
    );
  }

  _clearCookie(res) {
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`
    );
  }
}

module.exports = { ProxyServer };