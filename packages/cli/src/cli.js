#!/usr/bin/env node
'use strict';

/**
 * ProxyQ CLI
 *
 * Usage:
 *   npx proxyq start                          # use env vars
 *   npx proxyq start --config ./proxyq.config.js
 *   npx proxyq status                         # print queue stats
 *   npx proxyq flush                          # flush the queue
 *   npx proxyq --help
 */

const path = require('path');

const COMMANDS = ['start', 'status', 'flush', 'help'];

const args    = process.argv.slice(2);
const cmd     = args[0] || 'help';
const cfgFlag = args.indexOf('--config');
const cfgPath = cfgFlag !== -1 ? args[cfgFlag + 1] : null;

// ── Help ──────────────────────────────────────────────────────────────────

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`
  ProxyQ — lightweight virtual queue for your server

  Usage:
    proxyq start [--config <path>]    Start the proxy + queue engine
    proxyq start --dashboard          Also start the admin dashboard
    proxyq status                     Show current queue stats
    proxyq flush                      Clear the queue
    proxyq help                       Show this message

  Environment variables (alternative to config file):
    PROXYQ_ORIGIN              Target server URL (required)
    PROXYQ_PORT                Proxy port          (default: 3000)
    PROXYQ_WS_PORT             WebSocket port      (default: 3001)
    PROXYQ_DASHBOARD_PORT      Dashboard port      (default: 3002)
    PROXYQ_MAX_CONCURRENT      Max simultaneous users on origin (default: 100)
    PROXYQ_ADMIT_PER_INTERVAL  Users admitted per tick          (default: 10)
    PROXYQ_INTERVAL_MS         Tick rate in ms                  (default: 2000)
    PROXYQ_ADMIN_TOKEN         Dashboard auth token             (default: changeme)
    REDIS_HOST                 Redis hostname      (default: localhost)
    REDIS_PORT                 Redis port          (default: 6379)

  Example:
    PROXYQ_ORIGIN=http://localhost:8080 proxyq start --dashboard
  `);
  process.exit(0);
}

// ── Load config ───────────────────────────────────────────────────────────

function loadConfig() {
  if (cfgPath) {
    try {
      return require(path.resolve(process.cwd(), cfgPath));
    } catch (e) {
      console.error(`[ProxyQ] Failed to load config: ${cfgPath}\n${e.message}`);
      process.exit(1);
    }
  }
  // Try default location
  try { return require(path.resolve(process.cwd(), 'proxyq.config.js')); } catch {}
  return {};
}

// ── Start ─────────────────────────────────────────────────────────────────

if (cmd === 'start') {
  const config      = loadConfig();
  const withDash    = args.includes('--dashboard');

  const { createProxyQ } = require('../core/src/index');

  createProxyQ(config).then(app => {
    app.start();

    if (withDash) {
      const { DashboardServer } = require('../dashboard/src/server');
      const dash = new DashboardServer({
        port:       parseInt(process.env.PROXYQ_DASHBOARD_PORT || config.ports?.dashboard || '3002'),
        adminToken: process.env.PROXYQ_ADMIN_TOKEN || config.adminToken || 'changeme',
        redis:      app.redis,
        queue:      app.queue,
      });
      dash.start();
    }

    const shutdown = () => { app.stop(); process.exit(0); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT',  shutdown);
  }).catch(err => {
    console.error('[ProxyQ] Fatal error:', err.message);
    process.exit(1);
  });
}

// ── Status ────────────────────────────────────────────────────────────────

if (cmd === 'status') {
  const proxyPort = process.env.PROXYQ_PORT || '3000';
  const http = require('http');
  const req  = http.get(`http://localhost:${proxyPort}/__proxyq/health`, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const s = JSON.parse(data);
        console.log(`\n  ProxyQ status\n`);
        console.log(`  Waiting        : ${s.waiting}`);
        console.log(`  Admitted       : ${s.admitted}`);
        console.log(`  Available slots: ${s.availableSlots}`);
        console.log(`  Total joined   : ${s.totalJoined}`);
        console.log(`  Total admitted : ${s.totalAdmitted}`);
        console.log(`  Peak queue     : ${s.peakQueue}\n`);
      } catch {
        console.log(data);
      }
    });
  });
  req.on('error', () => {
    console.error(`[ProxyQ] Could not reach ProxyQ on port ${proxyPort}. Is it running?`);
    process.exit(1);
  });
}

// ── Flush ─────────────────────────────────────────────────────────────────

if (cmd === 'flush') {
  const dashPort  = process.env.PROXYQ_DASHBOARD_PORT || '3002';
  const adminTok  = process.env.PROXYQ_ADMIN_TOKEN    || 'changeme';
  const http      = require('http');

  const req = http.request({
    hostname: 'localhost',
    port:     parseInt(dashPort),
    path:     '/api/flush',
    method:   'POST',
    headers:  { 'Authorization': `Bearer ${adminTok}` },
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end',  () => {
      const r = JSON.parse(data);
      if (r.ok) console.log('[ProxyQ] Queue flushed successfully.');
      else      console.error('[ProxyQ] Flush failed:', data);
    });
  });
  req.on('error', () => {
    console.error(`[ProxyQ] Dashboard not reachable on port ${dashPort}.`);
    process.exit(1);
  });
  req.end();
}

if (!COMMANDS.includes(cmd)) {
  console.error(`[ProxyQ] Unknown command: ${cmd}. Run "proxyq help" for usage.`);
  process.exit(1);
}
