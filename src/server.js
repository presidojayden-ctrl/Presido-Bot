import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { registerUser, loginUser, getUserFromToken, logoutUser } from "./auth.js";
import { startSession, stopSession, getSessionStatus } from "./sessionManager.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const secureCookies = process.env.COOKIE_SECURE === "true";
const dashboard = path.resolve("public/index.html");

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function getCookie(req, name) {
  const cookies = req.headers.cookie?.split(";").map((v) => v.trim()) || [];
  const item = cookies.find((v) => v.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
function setAuthCookie(res, token) {
  const secure = secureCookies ? "; Secure" : "";
  res.setHeader("Set-Cookie", "presido_session=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800" + secure);
}
function clearAuthCookie(res) { res.setHeader("Set-Cookie", "presido_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"); }
function requireAuth(req, res) {
  const token = getCookie(req, "presido_session");
  const username = getUserFromToken(token);
  if (!username) { sendJson(res, 401, { error: "Authentication required." }); return null; }
  return { username, token };
}
async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (body.length > 10000) throw new Error("Request body is too large.");
  try { return JSON.parse(body || "{}"); } catch { throw new Error("Invalid JSON request."); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(await readFile(dashboard, "utf8"));
    }
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const { username, password } = await readBody(req);
      const user = await registerUser(username, password);
      const login = await loginUser(username, password);
      setAuthCookie(res, login.token);
      return sendJson(res, 201, user);
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const { username, password } = await readBody(req);
      const login = await loginUser(username, password);
      setAuthCookie(res, login.token);
      return sendJson(res, 200, { username: login.username });
    }
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = requireAuth(req, res); if (!auth) return;
      return sendJson(res, 200, { username: auth.username });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      logoutUser(getCookie(req, "presido_session")); clearAuthCookie(res);
      return sendJson(res, 200, { success: true });
    }
    if (req.method === "POST" && url.pathname === "/api/whatsapp/connect") {
      const auth = requireAuth(req, res); if (!auth) return;
      return sendJson(res, 200, await startSession(auth.username));
    }
    if (req.method === "GET" && url.pathname === "/api/whatsapp") {
      const auth = requireAuth(req, res); if (!auth) return;
      return sendJson(res, 200, getSessionStatus(auth.username));
    }
    if (req.method === "DELETE" && url.pathname === "/api/whatsapp") {
      const auth = requireAuth(req, res); if (!auth) return;
      return sendJson(res, 200, await stopSession(auth.username, { logout: true }));
    }
    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    return sendJson(res, 400, { error: error.message || "Request failed." });
  }
});

server.listen(port, host, () => console.log("Presido Bot dashboard: http://" + host + ":" + port));
