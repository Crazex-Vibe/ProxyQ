/**
 * ProxyQ configuration
 * Copy this file to your project root and edit as needed.
 *
 * Run with:
 *   npx proxyq --config proxyq.config.js
 *   OR
 *   docker-compose up  (uses env variables from .env)
 */

/** @type {import('@proxyq/core').ProxyQConfig} */
module.exports = {
  // URL of the server ProxyQ should protect
  origin: 'http://localhost:8080',

  // Ports ProxyQ will listen on
  ports: {
    proxy:     3000,   // your users hit this
    websocket: 3001,   // used internally for live updates
  },

  // Redis connection (defaults to localhost:6379)
  redis: {
    host:     'localhost',
    port:     6379,
    password: null,
  },

  queue: {
    // Max simultaneous users allowed on origin at once
    // Set this to what your server can comfortably handle
    maxConcurrent: 100,

    // How many users to admit per interval tick
    admitPerInterval: 10,

    // Tick rate in milliseconds (how often to check the queue)
    intervalMs: 2000,
  },
};
