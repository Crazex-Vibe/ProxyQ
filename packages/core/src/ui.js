'use strict';

/**
 * ProxyQ — waiting room HTML
 *
 * Returned as a string so it can be embedded in the proxy response.
 * Connects to the WebSocket server to get live position updates.
 * Auto-redirects when the server sends { type: 'admitted' }.
 */

function waitingRoomHtml({ tokenId, position, estimatedWaitMs, wsUrl }) {
  const waitSecs = Math.ceil((estimatedWaitMs || 0) / 1000);
  const waitText = waitSecs > 60
    ? `~${Math.ceil(waitSecs / 60)} min`
    : `~${waitSecs} sec`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Please wait — you're in the queue</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #1a1a1a;
    }

    .card {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 16px;
      padding: 48px 40px;
      width: 100%;
      max-width: 440px;
      text-align: center;
    }

    .badge {
      display: inline-block;
      background: #f0f0f0;
      color: #555;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 24px;
    }

    h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: #666;
      font-size: 15px;
      margin-bottom: 36px;
      line-height: 1.5;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 36px;
    }

    .stat {
      background: #f8f8f8;
      border-radius: 10px;
      padding: 16px 12px;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #888;
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 600;
      color: #1a1a1a;
      line-height: 1;
    }

    .stat-value.admitted {
      color: #16a34a;
    }

    .progress-track {
      height: 4px;
      background: #eee;
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 24px;
    }

    .progress-bar {
      height: 100%;
      background: #1a1a1a;
      border-radius: 99px;
      width: 0%;
      transition: width 0.8s ease;
    }

    .status-text {
      font-size: 13px;
      color: #888;
      margin-bottom: 0;
    }

    .status-text span {
      color: #1a1a1a;
      font-weight: 500;
    }

    .admitted-banner {
      display: none;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      padding: 16px;
      color: #15803d;
      font-weight: 500;
      font-size: 15px;
      margin-bottom: 24px;
    }

    .session-banner {
      display: none;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 10px;
      padding: 14px 16px;
      color: #92400e;
      font-size: 13px;
      margin-bottom: 24px;
      text-align: left;
    }

    .session-banner .session-title {
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .session-timer {
      font-size: 28px;
      font-weight: 600;
      color: #b45309;
      letter-spacing: -0.02em;
    }

    .session-timer.urgent { color: #dc2626; }

    .expired-banner {
      display: none;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 16px;
      color: #dc2626;
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 24px;
    }

    .pulse {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #16a34a;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.5; transform: scale(0.8); }
    }

    .footer {
      margin-top: 32px;
      font-size: 12px;
      color: #bbb;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">ProxyQ — virtual queue</div>

    <div class="admitted-banner" id="admitted-banner">
      <span class="pulse"></span>
      You're in! Redirecting now...
    </div>

    <div class="session-banner" id="session-banner">
      <div class="session-title">Session time remaining</div>
      <div class="session-timer" id="session-timer">—</div>
      <div style="margin-top:4px;font-size:12px">Your session will end automatically. Save your work before it expires.</div>
    </div>

    <div class="expired-banner" id="expired-banner">
      Your session has expired. You have been placed back in the queue.
    </div>

    <h1>You're in line</h1>
    <p class="subtitle" id="subtitle">
      The site is handling high traffic right now.<br>
      We'll let you in automatically — no need to refresh.
    </p>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Your position</div>
        <div class="stat-value" id="position">${position}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Est. wait</div>
        <div class="stat-value" id="wait">${waitText}</div>
      </div>
    </div>

    <div class="progress-track">
      <div class="progress-bar" id="progress-bar"></div>
    </div>

    <p class="status-text" id="status-text">
      Connecting to queue server...
    </p>

    <div class="footer">
      Powered by <strong>ProxyQ</strong> — open source queue protection
    </div>
  </div>

  <script>
    const TOKEN       = '${tokenId}';
    const WS_URL      = '${wsUrl}';
    const INITIAL_POS = ${position};

    let initialPosition = INITIAL_POS;
    let ws;

    const $position     = document.getElementById('position');
    const $wait         = document.getElementById('wait');
    const $status       = document.getElementById('status-text');
    const $progress     = document.getElementById('progress-bar');
    const $admitted     = document.getElementById('admitted-banner');
    const $subtitle     = document.getElementById('subtitle');
    const $sessionBanner = document.getElementById('session-banner');
    const $sessionTimer  = document.getElementById('session-timer');
    const $expiredBanner = document.getElementById('expired-banner');

    let sessionInterval = null;

    function formatWait(ms) {
      const secs = Math.ceil(ms / 1000);
      if (secs > 60) return '~' + Math.ceil(secs / 60) + ' min';
      return '~' + secs + ' sec';
    }

    function formatSeconds(s) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m + ':' + String(sec).padStart(2, '0');
    }

    function startSessionTimer(secondsLeft) {
      $sessionBanner.style.display = 'block';
      let remaining = secondsLeft;

      $sessionTimer.textContent = formatSeconds(remaining);

      if (sessionInterval) clearInterval(sessionInterval);
      sessionInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(sessionInterval);
          $sessionTimer.textContent = '0:00';
          return;
        }
        $sessionTimer.textContent = formatSeconds(remaining);
        // Go red in the last 30 seconds
        if (remaining <= 30) $sessionTimer.classList.add('urgent');
      }, 1000);
    }

    function onExpired() {
      if (sessionInterval) clearInterval(sessionInterval);
      $sessionBanner.style.display = 'none';
      $expiredBanner.style.display = 'block';
      $subtitle.textContent = 'Your session ended. You have been placed back in the queue.';
      // Re-enqueue by reloading — server will issue a fresh token
      setTimeout(() => window.location.reload(), 2500);
    }

    function setProgress(pos) {
      if (!initialPosition || initialPosition <= 0) return;
      const pct = Math.max(0, Math.min(100, ((initialPosition - pos) / initialPosition) * 100));
      $progress.style.width = pct + '%';
    }

    function onAdmitted() {
      $admitted.style.display = 'block';
      $position.textContent = '0';
      $position.classList.add('admitted');
      $wait.textContent = 'Now';
      $wait.classList.add('admitted');
      $progress.style.width = '100%';
      $subtitle.textContent = 'You have been admitted. Taking you to the site now...';
      $status.innerHTML = '<span>Redirecting...</span>';

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    }

    function connect() {
      ws = new WebSocket(WS_URL + '?token=' + TOKEN);

      ws.onopen = () => {
        $status.innerHTML = 'Connected — <span>live updates active</span>';
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'admitted') {
          onAdmitted();
          return;
        }

        if (msg.type === 'expired') {
          onExpired();
          return;
        }

        if (msg.type === 'session_expiring') {
          startSessionTimer(msg.secondsLeft);
          return;
        }

        if (msg.type === 'position') {
          const pos = msg.position;
          if (pos <= 0) { onAdmitted(); return; }

          $position.textContent = pos;
          $wait.textContent = formatWait(msg.estimatedWaitMs);
          setProgress(pos);
          $status.innerHTML = 'Queue is moving — <span>position updated</span>';
        }

        if (msg.type === 'error') {
          $status.innerHTML = '<span style="color:#dc2626">' + msg.message + '</span>';
        }
      };

      ws.onclose = () => {
        $status.textContent = 'Reconnecting...';
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        $status.textContent = 'Connection issue — retrying...';
      };
    }

    // Set initial progress bar
    setProgress(INITIAL_POS);
    connect();
  </script>
</body>
</html>`;
}

module.exports = { waitingRoomHtml };