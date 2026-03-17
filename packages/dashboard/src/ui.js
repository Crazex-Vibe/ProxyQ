'use strict';

/**
 * ProxyQ — Dashboard UI
 * Industrial / utilitarian aesthetic. Monospace data, high-contrast,
 * real-time sparklines drawn on <canvas>. Dark theme by default.
 */

function dashboardHtml({ port, token }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProxyQ — Admin Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');

    :root {
      --bg:        #0d0d0d;
      --bg2:       #141414;
      --bg3:       #1c1c1c;
      --border:    #2a2a2a;
      --border2:   #383838;
      --text:      #e8e8e8;
      --muted:     #666;
      --accent:    #e8ff3e;
      --accent2:   #3effc8;
      --danger:    #ff4444;
      --warning:   #ffaa00;
      --success:   #3effc8;
      --mono:      'IBM Plex Mono', monospace;
      --sans:      'IBM Plex Sans', sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--mono);
      font-size: 13px;
      min-height: 100vh;
      line-height: 1.5;
    }

    /* ── Layout ── */
    .shell {
      display: grid;
      grid-template-rows: 48px 1fr;
      grid-template-columns: 220px 1fr;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Header ── */
    header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      padding: 0 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg2);
      gap: 16px;
    }

    .logo {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--accent);
    }

    .logo span { color: var(--muted); font-weight: 400; }

    .header-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
      animation: blink 2s ease-in-out infinite;
    }

    .status-dot.paused { background: var(--warning); animation: none; }
    .status-dot.error  { background: var(--danger);  animation: none; }

    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }

    .status-label { color: var(--muted); font-size: 11px; }

    /* ── Sidebar ── */
    aside {
      background: var(--bg2);
      border-right: 1px solid var(--border);
      padding: 20px 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }

    .nav-section {
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 14px 20px 6px;
    }

    .nav-btn {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 20px;
      background: none;
      border: none;
      color: var(--muted);
      font-family: var(--mono);
      font-size: 12px;
      cursor: pointer;
      transition: color 0.1s, background 0.1s;
    }

    .nav-btn:hover { color: var(--text); background: var(--bg3); }
    .nav-btn.active { color: var(--accent); }

    /* ── Main ── */
    main {
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* ── Stat cards ── */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .stat-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 16px 18px;
      position: relative;
      overflow: hidden;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: var(--accent);
      opacity: 0.6;
    }

    .stat-card.danger::before  { background: var(--danger); }
    .stat-card.warning::before { background: var(--warning); }
    .stat-card.success::before { background: var(--success); }

    .stat-label {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 600;
      letter-spacing: -0.03em;
      color: var(--text);
      line-height: 1;
      margin-bottom: 4px;
    }

    .stat-sub {
      font-size: 11px;
      color: var(--muted);
    }

    /* ── Sparkline row ── */
    .chart-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .chart-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 16px 18px;
    }

    .chart-title {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }

    canvas { width: 100% !important; display: block; }

    /* ── Controls ── */
    .controls-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .control-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 16px 18px;
    }

    .control-title {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 14px;
    }

    .btn-row { display: flex; gap: 8px; flex-wrap: wrap; }

    .btn {
      font-family: var(--mono);
      font-size: 12px;
      padding: 8px 16px;
      border-radius: 3px;
      border: 1px solid var(--border2);
      background: var(--bg3);
      color: var(--text);
      cursor: pointer;
      transition: background 0.1s, border-color 0.1s, color 0.1s;
    }

    .btn:hover { background: var(--border); }

    .btn.primary {
      border-color: var(--accent);
      color: var(--accent);
    }
    .btn.primary:hover { background: var(--accent); color: #000; }

    .btn.danger-btn {
      border-color: var(--danger);
      color: var(--danger);
    }
    .btn.danger-btn:hover { background: var(--danger); color: #fff; }

    .btn.warning-btn {
      border-color: var(--warning);
      color: var(--warning);
    }
    .btn.warning-btn:hover { background: var(--warning); color: #000; }

    /* ── Config form ── */
    .config-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }

    .field label {
      display: block;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .field input {
      width: 100%;
      background: var(--bg3);
      border: 1px solid var(--border2);
      border-radius: 3px;
      padding: 7px 10px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }

    .field input:focus { border-color: var(--accent); }

    /* ── Log / Event stream ── */
    .log-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 16px 18px;
    }

    .log-title {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .log-scroll {
      height: 160px;
      overflow-y: auto;
      display: flex;
      flex-direction: column-reverse;
    }

    .log-line {
      font-size: 11px;
      padding: 3px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 12px;
      color: var(--muted);
    }

    .log-line .ts  { color: var(--muted); min-width: 80px; }
    .log-line .msg { color: var(--text); }
    .log-line.event-admit   .msg { color: var(--success); }
    .log-line.event-pause   .msg { color: var(--warning); }
    .log-line.event-flush   .msg { color: var(--danger);  }
    .log-line.event-connect .msg { color: var(--accent);  }

    /* ── Toast ── */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--bg3);
      border: 1px solid var(--border2);
      border-radius: 4px;
      padding: 10px 16px;
      font-size: 12px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
      z-index: 999;
    }
    #toast.show { opacity: 1; transform: none; }
    #toast.ok   { border-color: var(--success); color: var(--success); }
    #toast.err  { border-color: var(--danger);  color: var(--danger);  }
  </style>
</head>
<body>
<div class="shell">

  <!-- Header -->
  <header>
    <div class="logo">ProxyQ <span>/ admin</span></div>
    <div class="header-right">
      <div class="status-dot" id="conn-dot"></div>
      <span class="status-label" id="conn-label">connecting...</span>
    </div>
  </header>

  <!-- Sidebar -->
  <aside>
    <div class="nav-section">Views</div>
    <button class="nav-btn active" onclick="showView('overview')">Overview</button>
    <button class="nav-btn" onclick="showView('controls')">Controls</button>
    <button class="nav-btn" onclick="showView('config')">Config</button>
    <button class="nav-btn" onclick="showView('log')">Event log</button>

    <div class="nav-section" style="margin-top:auto">System</div>
    <button class="nav-btn" id="health-btn" onclick="checkHealth()">Health check</button>
  </aside>

  <!-- Main content -->
  <main id="main">

    <!-- ── Overview ── -->
    <section id="view-overview">
      <div class="stat-grid">
        <div class="stat-card warning" id="card-waiting">
          <div class="stat-label">Waiting in queue</div>
          <div class="stat-value" id="stat-waiting">—</div>
          <div class="stat-sub">users pending admission</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">Currently admitted</div>
          <div class="stat-value" id="stat-admitted">—</div>
          <div class="stat-sub">on origin server now</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Available slots</div>
          <div class="stat-value" id="stat-slots">—</div>
          <div class="stat-sub">of <span id="stat-max">—</span> max concurrent</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total admitted</div>
          <div class="stat-value" id="stat-total">—</div>
          <div class="stat-sub">peak queue: <span id="stat-peak">—</span></div>
        </div>
      </div>

      <div class="chart-row">
        <div class="chart-card">
          <div class="chart-title">Waiting — last 60s</div>
          <canvas id="chart-waiting" height="80"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-title">Admitted — last 60s</div>
          <canvas id="chart-admitted" height="80"></canvas>
        </div>
      </div>

      <div class="log-card">
        <div class="log-title">
          <span class="status-dot" id="log-dot"></span>
          Live event stream
        </div>
        <div class="log-scroll" id="log-scroll"></div>
      </div>
    </section>

    <!-- ── Controls ── -->
    <section id="view-controls" style="display:none">
      <div class="controls-row">
        <div class="control-card">
          <div class="control-title">Queue admission</div>
          <div class="btn-row">
            <button class="btn primary" onclick="api('POST','/api/resume')">Resume</button>
            <button class="btn warning-btn" onclick="api('POST','/api/pause')">Pause</button>
          </div>
          <p style="margin-top:12px;font-size:11px;color:var(--muted)">
            Pausing stops the admit ticker. Waiting users stay in queue — no one is admitted until you resume.
          </p>
        </div>
        <div class="control-card">
          <div class="control-title">Emergency flush</div>
          <div class="btn-row">
            <button class="btn danger-btn" onclick="confirmFlush()">Flush queue</button>
          </div>
          <p style="margin-top:12px;font-size:11px;color:var(--muted)">
            Instantly clears ALL waiting users from the queue. Use during a deployment or server restart. Waiting users will be re-enqueued when they refresh.
          </p>
        </div>
      </div>
    </section>

    <!-- ── Config ── -->
    <section id="view-config" style="display:none">
      <div class="control-card">
        <div class="control-title">Live config — changes apply immediately without restart</div>
        <div class="config-grid">
          <div class="field">
            <label>Max concurrent users</label>
            <input type="number" id="cfg-max" min="1" placeholder="100">
          </div>
          <div class="field">
            <label>Admit per interval</label>
            <input type="number" id="cfg-admit" min="1" placeholder="10">
          </div>
          <div class="field">
            <label>Interval (ms)</label>
            <input type="number" id="cfg-interval" min="500" placeholder="2000">
          </div>
        </div>
        <div class="btn-row">
          <button class="btn primary" onclick="saveConfig()">Apply config</button>
        </div>
      </div>
    </section>

    <!-- ── Log ── -->
    <section id="view-log" style="display:none">
      <div class="log-card" style="height:calc(100vh - 140px)">
        <div class="log-title">Full event log</div>
        <div id="log-full" style="height:calc(100% - 30px);overflow-y:auto;display:flex;flex-direction:column-reverse"></div>
      </div>
    </section>

  </main>
</div>

<div id="toast"></div>

<script>
  const TOKEN    = '${token}';
  const WS_URL   = 'ws://' + location.hostname + ':${port}/live?token=' + TOKEN;
  const API_BASE = '';

  let ws;
  let lastStats = {};
  const MAX_LOG = 200;
  const logEntries = [];

  // ── Charts ───────────────────────────────────────────────────────────────

  function drawSparkline(canvasId, history, key, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = 80;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!history || history.length < 2) return;

    const vals = history.map(p => p[key] || 0);
    const max  = Math.max(...vals, 1);

    // Fill
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - (v / max) * (h - 10) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = color + '22';
    ctx.fill();

    // Line
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - (v / max) * (h - 10) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Current value label
    const last  = vals[vals.length - 1];
    ctx.fillStyle = color;
    ctx.font      = '600 11px "IBM Plex Mono", monospace';
    ctx.fillText(last, 6, 14);
  }

  // ── Stats update ──────────────────────────────────────────────────────────

  function applyStats(s) {
    lastStats = s;

    setText('stat-waiting',  s.waiting);
    setText('stat-admitted', s.admitted);
    setText('stat-slots',    s.availableSlots);
    setText('stat-max',      s.maxConcurrent ?? '—');
    setText('stat-total',    s.totalAdmitted);
    setText('stat-peak',     s.peakQueue);

    // Colour queue card by urgency
    const card = document.getElementById('card-waiting');
    card.className = 'stat-card ' + (s.waiting > 500 ? 'danger' : s.waiting > 50 ? 'warning' : 'success');

    // Header status
    const dot   = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    const logd  = document.getElementById('log-dot');
    if (s.paused) {
      dot.className = 'status-dot paused';
      label.textContent = 'paused';
    } else {
      dot.className = 'status-dot';
      label.textContent = 'live';
    }
    logd.className = dot.className;

    // Charts
    if (s.history) {
      drawSparkline('chart-waiting',  s.history, 'waiting',  '#ffaa00');
      drawSparkline('chart-admitted', s.history, 'admitted', '#3effc8');
    }

    // Pre-fill config fields if empty
    if (!document.getElementById('cfg-max').value && s.maxConcurrent) {
      document.getElementById('cfg-max').value      = s.maxConcurrent;
      document.getElementById('cfg-admit').value    = s.admitPerInterval ?? '';
      document.getElementById('cfg-interval').value = s.intervalMs ?? '';
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(val)) el.textContent = val;
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      addLog('connect', 'WebSocket connected to ProxyQ');
      document.getElementById('conn-dot').className   = 'status-dot';
      document.getElementById('conn-label').textContent = 'live';
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        applyStats(data);
      } catch {}
    };

    ws.onclose = () => {
      document.getElementById('conn-dot').className   = 'status-dot error';
      document.getElementById('conn-label').textContent = 'reconnecting...';
      addLog('error', 'WebSocket disconnected — retrying in 3s');
      setTimeout(connect, 3000);
    };
  }

  // ── API helpers ───────────────────────────────────────────────────────────

  async function api(method, path, body) {
    const opts = {
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type':  'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(API_BASE + path, opts);
    const json = await res.json();
    return json;
  }

  async function saveConfig() {
    const cfg = {
      maxConcurrent:    document.getElementById('cfg-max').value,
      admitPerInterval: document.getElementById('cfg-admit').value,
      intervalMs:       document.getElementById('cfg-interval').value,
    };
    const res = await api('POST', '/api/config', cfg);
    if (res.ok) {
      toast('Config applied', 'ok');
      addLog('config', 'Config updated: ' + JSON.stringify(cfg));
    } else {
      toast('Failed to apply config', 'err');
    }
  }

  async function confirmFlush() {
    if (!confirm('Flush the entire queue? All waiting users will be removed.')) return;
    const res = await api('POST', '/api/flush');
    if (res.ok) {
      toast('Queue flushed', 'ok');
      addLog('flush', 'Queue flushed by admin');
    }
  }

  async function checkHealth() {
    const res  = await fetch('/__proxyq/health');
    const json = await res.json();
    toast('Health: ' + JSON.stringify(json), json.status === 'ok' ? 'ok' : 'err');
  }

  // ── Log ───────────────────────────────────────────────────────────────────

  function addLog(type, msg) {
    const now  = new Date();
    const ts   = now.toTimeString().slice(0, 8);
    const entry = { type, msg, ts };
    logEntries.unshift(entry);
    if (logEntries.length > MAX_LOG) logEntries.pop();
    renderLog('log-scroll', 20);
    renderLog('log-full',   MAX_LOG);
  }

  function renderLog(containerId, limit) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = logEntries.slice(0, limit).map(e =>
      '<div class="log-line event-' + e.type + '">' +
      '<span class="ts">' + e.ts + '</span>' +
      '<span class="msg">' + e.msg + '</span></div>'
    ).join('');
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  function showView(name) {
    ['overview','controls','config','log'].forEach(v => {
      document.getElementById('view-' + v).style.display = v === name ? '' : 'none';
    });
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase().includes(name));
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  let toastTimer;
  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = 'show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3000);
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  connect();
  addLog('connect', 'Dashboard loaded');
</script>
</body>
</html>`;
}

module.exports = { dashboardHtml };
