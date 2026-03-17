# ProxyQ

**A lightweight, open source virtual waiting room. Protect your server from traffic spikes — no expensive SaaS needed.**

When your site gets hit with a flood of users at the same time (exam results, ticket drops, flash sales), ProxyQ puts them in a fair queue and lets them in at a rate your server can actually handle. Everyone else sees a clean waiting room with their live position and estimated wait time — instead of a crash page.

> Inspired by 2b2t's Minecraft queue system. Built for small companies, universities, and government portals that can't afford Queue-it or Cloudflare Waiting Room.

---

## How it works

```
Users → [ ProxyQ :3000 ] → Your server
              ↕
        Redis queue
              ↕
      Admin dashboard :3002
```

1. A visitor arrives → ProxyQ gives them a token and adds them to the queue
2. They see a waiting room page with their live position (updates via WebSocket, no refresh needed)
3. The queue engine admits N users every X seconds — you control this
4. Admitted users are forwarded transparently to your origin server
5. When they leave, their slot opens for the next person in line

---

## Prerequisites

Before running ProxyQ you need three things installed:

### 1. Node.js (v18 or higher)
```bash
node --version   # should show v18.x or higher
```
Download from: https://nodejs.org

### 2. Redis
Redis is the database ProxyQ uses to store the queue.

**macOS:**
```bash
brew install redis
brew services start redis
redis-cli ping   # should reply: PONG
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install redis-server
sudo systemctl start redis
redis-cli ping   # should reply: PONG
```

**Windows:**
Use WSL2 (Windows Subsystem for Linux) and follow the Ubuntu steps above.

### 3. Git
```bash
git --version
```
Download from: https://git-scm.com

---

## Quick start

### Option A — Run with Node.js

```bash
# 1. Clone the repo
git clone https://github.com/Crazex-Vibe/ProxyQ.git
cd ProxyQ

# 2. Install dependencies
npm install

# 3. Start ProxyQ
PROXYQ_ORIGIN=http://your-server:8080 node packages/cli/src/cli.js start --dashboard
```

### Option B — Docker (recommended for production)

```bash
# 1. Clone the repo
git clone https://github.com/Crazex-Vibe/ProxyQ.git
cd ProxyQ/deploy/docker

# 2. Copy and edit the env file
cp ../../.env.example .env
nano .env   # set PROXYQ_ORIGIN to your server URL

# 3. Start everything
docker-compose up
```

Docker will automatically start Redis too — no separate install needed.

---

## Configuration

Copy `.env.example` to `.env` and edit the values:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PROXYQ_ORIGIN` | — | **Required.** Your backend server URL e.g. `http://localhost:8080` |
| `PROXYQ_PORT` | `3000` | Port ProxyQ listens on — point your domain here |
| `PROXYQ_WS_PORT` | `3001` | WebSocket port for live queue updates |
| `PROXYQ_DASHBOARD_PORT` | `3002` | Admin dashboard port |
| `PROXYQ_MAX_CONCURRENT` | `100` | Max users allowed on origin at the same time |
| `PROXYQ_ADMIT_PER_INTERVAL` | `10` | How many users to let in per tick |
| `PROXYQ_INTERVAL_MS` | `2000` | Tick rate in milliseconds |
| `PROXYQ_ADMIN_TOKEN` | `changeme` | Password for the admin dashboard — **change this!** |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |

**Tuning tip:** Set `PROXYQ_MAX_CONCURRENT` to the number of users your server handles comfortably without slowing down. Start low (e.g. 50) and increase if your server holds up.

---

## Admin dashboard

Open `http://localhost:3002` in your browser after starting ProxyQ.

The dashboard shows:
- Live queue size and admitted user count
- Real-time sparkline charts (last 60 seconds)
- Pause / resume queue admission
- Emergency flush (clear all waiting users instantly)
- Live config editor — change limits without restarting

---

## Project structure

```
ProxyQ/
├── packages/
│   ├── core/           — queue engine, proxy, WebSocket server
│   ├── dashboard/      — admin control panel
│   └── cli/            — npx proxyq commands
├── deploy/
│   └── docker/         — Dockerfile + docker-compose.yml
├── config/
│   └── proxyq.config.js — optional JS config file
├── simulate.js          — traffic simulator for testing
├── .env.example         — environment variable template
└── README.md
```

---

## Testing with the traffic simulator

ProxyQ comes with a built-in traffic simulator so you can test the queue locally.

Make sure ProxyQ is running first, then open a new terminal:

```bash
# Simulate 100 users hitting the proxy in wave mode
node simulate.js

# Simulate 200 users
node simulate.js 200

# Simulate 500 users all at once
node simulate.js 500 fast
```

Watch the queue fill up in real time at `http://localhost:3002`.

---

## Built-in endpoints

These are exposed by the proxy automatically:

| Endpoint | Description |
|---|---|
| `GET /__proxyq/health` | JSON stats — queue size, admitted count, available slots |
| `GET /__proxyq/release` | Call this on logout to free a slot for the next user |

---

## Deployment on a VPS

To make ProxyQ publicly accessible:

1. Get a VPS (DigitalOcean, AWS EC2, Hetzner — any will work)
2. Install Docker on the VPS
3. Clone the repo and set your `.env`
4. Run `docker-compose up -d`
5. Point your domain's DNS to the VPS IP
6. Set `PROXYQ_ORIGIN` to your actual backend server URL

ProxyQ will sit in front of your server and handle all the traffic management automatically.

---

## Why ProxyQ?

| | ProxyQ | Queue-it | Cloudflare Waiting Room |
|---|---|---|---|
| Price | Free | $$$$ | $$$ |
| Self-hosted | Yes | No | No |
| Open source | Yes | No | No |
| Setup time | 5 minutes | Hours | Hours |
| Redis required | Yes | No | No |

---

## License

MIT — free to use, modify, and deploy.

---

## Contributing

Pull requests are welcome. If you find a bug or want a feature, open an issue on GitHub.

Built with the idea that good infrastructure tooling should be free and accessible to everyone — not just companies that can afford enterprise SaaS.