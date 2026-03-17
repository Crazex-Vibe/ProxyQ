'use strict';

/**
 * ProxyQ — main entry point
 *
 * Usage:
 *   const { createProxyQ } = require('@proxyq/core');
 *
 *   const app = await createProxyQ({
 *     origin: 'http://localhost:8080',
 *     redis:  { host: 'localhost', port: 6379 },
 *     queue: {
 *       maxConcurrent:    100,   // max simultaneous users on origin
 *       admitPerInterval: 10,    // users let in per tick
 *       intervalMs:       2000,  // tick rate
 *     },
 *     ports: {
 *       proxy:     3000,
 *       websocket: 3001,
 *     },
 *   });
 *
 *   app.start();
 */

const Redis  = require('ioredis');
const { QueueManager }  = require('./queue');
const { RealtimeServer } = require('./realtime');
const { ProxyServer }    = require('./proxy');
const { waitingRoomHtml } = require('./ui');

async function createProxyQ(config = {}) {
  const {
    origin = process.env.PROXYQ_ORIGIN || 'http://localhost:8080',
    redis:  redisConfig = {},
    queue:  queueConfig = {},
    ports:  portsConfig = {},
  } = config;

  const proxyPort = portsConfig.proxy     ?? parseInt(process.env.PROXYQ_PORT    || '3000');
  const wsPort    = portsConfig.websocket ?? parseInt(process.env.PROXYQ_WS_PORT || '3001');
  const wsUrl     = process.env.PROXYQ_WS_URL || `ws://localhost:${wsPort}`;

  // ── Redis connection ──
  const redis = new Redis({
    host:            redisConfig.host     ?? process.env.REDIS_HOST ?? 'localhost',
    port:            redisConfig.port     ?? parseInt(process.env.REDIS_PORT || '6379'),
    password:        redisConfig.password ?? process.env.REDIS_PASSWORD,
    retryStrategy:   (times) => Math.min(times * 100, 3000),
    lazyConnect:     true,
  });

  await redis.connect();
  console.log('[ProxyQ] Redis connected');

  // ── Queue manager ──
  const queue = new QueueManager(redis, {
    maxConcurrent:    queueConfig.maxConcurrent    ?? parseInt(process.env.PROXYQ_MAX_CONCURRENT    || '100'),
    admitPerInterval: queueConfig.admitPerInterval ?? parseInt(process.env.PROXYQ_ADMIT_PER_INTERVAL || '10'),
    intervalMs:       queueConfig.intervalMs       ?? parseInt(process.env.PROXYQ_INTERVAL_MS        || '2000'),
    onAdmit: (tokenId) => realtime.notifyAdmitted(tokenId),
  });

  // ── Realtime WS server ──
  const realtime = new RealtimeServer({ port: wsPort, queue });

  // ── HTTP proxy ──
  const proxy = new ProxyServer({
    port:    proxyPort,
    origin,
    wsUrl,
    queue,
    getWaitingRoomHtml: waitingRoomHtml,
  });

  return {
    start() {
      realtime.start();
      queue.start();
      proxy.start();
      console.log(`\n  ProxyQ is running\n  Proxy  → http://localhost:${proxyPort}\n  WS     → ws://localhost:${wsPort}\n  Origin → ${origin}\n`);
    },
    stop() {
      queue.stop();
      realtime.stop();
      proxy.stop();
      redis.disconnect();
    },
    // Expose internals for testing / admin integrations
    queue,
    realtime,
    redis,
  };
}

// Allow running directly: node src/index.js
if (require.main === module) {
  createProxyQ().then(app => {
    app.start();
    process.on('SIGTERM', () => { app.stop(); process.exit(0); });
    process.on('SIGINT',  () => { app.stop(); process.exit(0); });
  }).catch(err => {
    console.error('[ProxyQ] Startup error:', err);
    process.exit(1);
  });
}

module.exports = { createProxyQ };