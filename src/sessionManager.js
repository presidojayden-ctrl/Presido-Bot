import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from "@whiskeysockets/baileys";
import P from "pino";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { handleCommand } from "./commands.js";

const sessions = new Map();
const reconnectTimers = new Map();
const SESSION_ROOT = path.resolve(process.env.PRESIDO_SESSION_DIR || "sessions");

function normalizeUserId(userId) {
  if (!userId || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) throw new Error("Invalid userId. Use 1-64 letters, numbers, hyphens or underscores.");
  return userId;
}
function getSessionPath(userId) { return path.join(SESSION_ROOT, normalizeUserId(userId)); }

export function getSessionStatus(userId) {
  const session = sessions.get(userId);
  if (!session) return { userId, status: "stopped", connected: false, hasPairingCode: false, pairingCode: null, jid: null };
  return {
    userId,
    status: session.status,
    connected: session.status === "connected",
    hasPairingCode: Boolean(session.pairingCode),
    pairingCode: session.pairingCode || null,
    jid: session.jid || null
  };
}

export async function startSession(userId, phoneNumber) {
  userId = normalizeUserId(userId);
  const existing = sessions.get(userId);
  if (existing?.status === "connected" || existing?.status === "connecting" || existing?.status === "awaiting_pairing") return getSessionStatus(userId);

  const digits = String(phoneNumber || "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) throw new Error("Enter a valid WhatsApp number with country code, digits only.");
  
  await mkdir(getSessionPath(userId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(getSessionPath(userId));
  const session = { userId, status: "connecting", pairingCode: null, jid: null, sock: null };
  sessions.set(userId, session);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Chrome")
  });
  session.sock = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "connecting" && !state.creds.registered && !session.pairingCode) {
      try {
        session.status = "awaiting_pairing";
        session.pairingCode = await sock.requestPairingCode(digits);
        console.log(`📱 [${userId}] Pairing code ready: ${session.pairingCode}`);
      } catch (error) {
        session.status = "pairing_failed";
        session.pairingCode = null;
        console.error(`[${userId}] Pairing code request failed:`, error);
      }
    }

    if (connection === "open") {
      session.status = "connected";
      session.pairingCode = null;
      session.jid = sock.user?.id || null;
      console.log(`✅ [${userId}] WhatsApp connected: ${session.jid}`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        session.status = "logged_out";
        session.pairingCode = null;
        session.jid = null;
        session.sock = null;
        console.log(`❌ [${userId}] WhatsApp session logged out.`);
        return;
      }
      session.status = "reconnecting";
      session.pairingCode = null;
      session.jid = null;
      session.sock = null;
      if (reconnectTimers.has(userId)) return;
      const timer = setTimeout(() => {
        reconnectTimers.delete(userId);
        startSession(userId, digits).catch((error) => console.error(`[${userId}] Reconnect failed:`, error));
      }, 3000);
      reconnectTimers.set(userId, timer);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      try {
        if (!message?.message || message.key.fromMe) continue;
        const text = message.message.conversation || message.message.extendedTextMessage?.text || "";
        if (!text.trim()) continue;
        const source = message.key.remoteJid?.endsWith("@g.us") ? "group" : "private";
        console.log(`📩 [${userId}] [${source}] ${text}`);
        await handleCommand(sock, message, text.trim());
      } catch (error) { console.error(`[${userId}] Message handling error:`, error); }
    }
  });

  return getSessionStatus(userId);
}

export async function stopSession(userId, { logout = false } = {}) {
  userId = normalizeUserId(userId);
  const session = sessions.get(userId);
  if (!session) return getSessionStatus(userId);
  if (reconnectTimers.has(userId)) { clearTimeout(reconnectTimers.get(userId)); reconnectTimers.delete(userId); }
  if (logout && session.sock) await session.sock.logout(); else if (session.sock) session.sock.ws?.close();
  sessions.delete(userId);
  return getSessionStatus(userId);
}

export function listSessions() { return [...sessions.keys()].map(getSessionStatus); }
