# ProxyQ

**A lightweight, self-hostable virtual waiting room. Protect your server from traffic spikes — no expensive SaaS needed.**

```
Users → [ ProxyQ ] → Your server
           ↑
      Redis queue
```

When your site gets slammed (exam results, flash sales, ticket drops), ProxyQ puts visitors in a fair first-come-first-served queue and admits them at a rate your server can handle. Everyone else sees a clean waiting room with their live position and estimated wait time.

---

## How it works

1. A visitor arrives → ProxyQ gives them a token and adds them to the queue
2. The waiting room page opens — their position updates live via WebSocket
3. The queue engine admits N users every X seconds (you control this)
4. Admitted users are proxied transparently to your origin server
5. When they leave, their slot opens for the next person in line

---

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/Crazex-Vibe/ProxyQ.git
cd proxyq/deploy/docker

# Set your origin server
echo "PROXYQ_ORIGIN=http://your-server:8080" > .env

docker-compose up
```

ProxyQ is now running on **http://localhost:3000** — point your domain here.

### npm

```bash
npm install @proxyq/core
```

```js
const { createProxyQ } = require('@proxyq/core');

const app = await createProxyQ({
  origin: 'http://localhost:8080',
  queue: {
    maxConcurrent:    100,
    admitPerInterval: 10,
    intervalMs:       2000,
  },
});

app.start();
```

---

## Configuration

| Option | Env var | Default | Description |
|---|---|---|---|
| `origin` | `PROXYQ_ORIGIN` | — | Your backend server URL |
| `ports.proxy` | `PROXYQ_PORT` | `3000` | Public-facing port |
| `ports.websocket` | `PROXYQ_WS_PORT` | `3001` | WebSocket port |
| `queue.maxConcurrent` | `PROXYQ_MAX_CONCURRENT` | `100` | Max simultaneous users on origin |
| `queue.admitPerInterval` | `PROXYQ_ADMIT_PER_INTERVAL` | `10` | Users admitted per tick |
| `queue.intervalMs` | `PROXYQ_INTERVAL_MS` | `2000` | Tick rate in ms |
| `redis.host` | `REDIS_HOST` | `localhost` | Redis host |

**Tuning tip:** Set `maxConcurrent` to the number of concurrent users your server handles without slowing down. Start low and increase if your server handles it.

---

## Health check

```
GET /__proxyq/health
```

Returns queue stats as JSON — use this for monitoring.

---

## Built-in endpoints

| Path | Description |
|---|---|
| `/__proxyq/health` | JSON stats — waiting, admitted, slots available |
| `/__proxyq/release` | Called when a user logs out / session ends |

---

## License

MIT — free to use, modify, and self-host.
