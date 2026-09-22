import http from "node:http";
import { startSession, stopSession, getSessionStatus, listSessions } from "./sessionManager.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Presido Bot — WhatsApp Connect</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; }
    input, button { padding: 10px; font-size: 16px; }
    button { cursor: pointer; }
    #qr img { width: 280px; image-rendering: pixelated; }
    .muted { color: #666; }
  </style>
</head>
<body>
  <h1>Presido Bot</h1>
  <p class="muted">Create a session, then scan its WhatsApp QR code from Linked devices.</p>
  <input id="userId" placeholder="user_001" autocomplete="off">
  <button onclick="connect()">Connect WhatsApp</button>
  <div id="status"></div>
  <div id="qr"></div>
  <script>
    let timer;
    async function connect() {
      const userId = document.getElementById("userId").value.trim();
      if (!userId) return;
      document.getElementById("qr").innerHTML = "";
      document.getElementById("status").textContent = "Starting session...";
      await fetch("/api/sessions/" + encodeURIComponent(userId), { method: "POST" });
      clearInterval(timer);
      timer = setInterval(() => poll(userId), 1500);
      poll(userId);
    }
    async function poll(userId) {
      const response = await fetch("/api/sessions/" + encodeURIComponent(userId));
      const data = await response.json();
      document.getElementById("status").textContent =
        "Status: " + data.status + (data.jid ? " — " + data.jid : "");
      if (data.qr) {
        document.getElementById("qr").innerHTML = "<p>Scan this QR:</p><img src='" + data.qr + "' alt='WhatsApp QR code'>";
      } else if (data.status === "connected") {
        document.getElementById("qr").innerHTML = "<p>✅ WhatsApp connected.</p>";
        clearInterval(timer);
      }
    }
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      return sendHtml(res, html);
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      return sendJson(res, 200, { sessions: listSessions() });
    }

    const match = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);

    if (match && req.method === "GET") {
      return sendJson(res, 200, getSessionStatus(decodeURIComponent(match[1])));
    }

    if (match && req.method === "POST") {
      const userId = decodeURIComponent(match[1]);
      const status = await startSession(userId);
      return sendJson(res, 200, status);
    }

    if (match && req.method === "DELETE") {
      const userId = decodeURIComponent(match[1]);
      const status = await stopSession(userId, { logout: true });
      return sendJson(res, 200, status);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`🌐 Presido Bot dashboard: http://${host}:${port}`);
});
