#!/usr/bin/env node
'use strict';

/**
 * ProxyQ — Traffic Simulator
 *
 * Simulates N users hitting the proxy at the same time.
 * Watch the queue fill up at http://localhost:3002
 *
 * Usage:
 *   node simulate.js          → 100 users, wave mode
 *   node simulate.js 200      → 200 users
 *   node simulate.js 50 fast  → 50 users, all at once
 */

const http = require('http');

const TARGET   = process.env.TARGET || 'http://localhost:3000';
const COUNT    = parseInt(process.argv[2] || '100');
const MODE     = process.argv[3] || 'wave';
const WAVE_GAP = 50; // ms between each user in wave mode

const c = {
  green:  t => `\x1b[32m${t}\x1b[0m`,
  yellow: t => `\x1b[33m${t}\x1b[0m`,
  red:    t => `\x1b[31m${t}\x1b[0m`,
  cyan:   t => `\x1b[36m${t}\x1b[0m`,
  gray:   t => `\x1b[90m${t}\x1b[0m`,
  bold:   t => `\x1b[1m${t}\x1b[0m`,
};

let admitted = 0, waiting = 0, errors = 0, completed = 0;

function printStatus() {
  process.stdout.write(
    `\r  ${c.green('admitted: ' + admitted)}  ` +
    `${c.yellow('waiting: ' + waiting)}  ` +
    `${c.red('errors: ' + errors)}  ` +
    `${c.gray('done: ' + completed + '/' + COUNT)}   `
  );
}

function makeRequest(userId) {
  return new Promise((resolve) => {
    const url  = new URL(TARGET);
    const opts = {
      hostname: url.hostname,
      port:     parseInt(url.port) || 3000,
      path:     '/',
      method:   'GET',
      headers:  { 'User-Agent': `ProxyQ-Simulator/User-${userId}` },
    };

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        completed++;
        if (res.statusCode === 200 && body.includes('in line')) {
          waiting++;
        } else if (res.statusCode === 200 || res.statusCode === 302) {
          admitted++;
        } else {
          errors++;
        }
        printStatus();
        resolve();
      });
    });

    req.on('error', () => { errors++; completed++; printStatus(); resolve(); });
    req.setTimeout(10000, () => { errors++; completed++; req.destroy(); resolve(); });
    req.end();
  });
}

async function run() {
  console.log(`\n  ${c.bold('ProxyQ Traffic Simulator')}`);
  console.log(`  Target    : ${c.cyan(TARGET)}`);
  console.log(`  Users     : ${c.cyan(COUNT)}`);
  console.log(`  Mode      : ${c.cyan(MODE === 'fast' ? 'all at once' : 'wave (' + WAVE_GAP + 'ms apart)')}`);
  console.log(`  Dashboard : ${c.cyan('http://localhost:3002')}`);
  console.log(`\n  ${c.gray('Watch the queue fill up in the dashboard in real time!')}\n`);

  const start    = Date.now();
  const promises = [];

  for (let i = 1; i <= COUNT; i++) {
    if (MODE !== 'fast') await new Promise(r => setTimeout(r, WAVE_GAP));
    promises.push(makeRequest(i));
  }

  await Promise.all(promises);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n  ${c.bold('Done!')}`);
  console.log(`  Time     : ${elapsed}s`);
  console.log(`  Admitted : ${c.green(admitted)}`);
  console.log(`  Waiting  : ${c.yellow(waiting)}`);
  console.log(`  Errors   : ${c.red(errors)}`);
  console.log(`\n  ${c.gray('Try: node simulate.js 500 fast')}\n`);
}

run().catch(console.error);