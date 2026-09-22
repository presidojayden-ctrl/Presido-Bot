import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import P from "pino";
import qrcode from "qrcode";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { handleCommand } from "./commands.js";

const sessions = new Map();
const reconnectTimers = new Map();

const SESSION_ROOT = path.resolve("sessions");

function normalizeUserId(userId) {
  if (!userId || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) {
    throw new Error("Invalid userId. Use 1-64 letters, numbers, hyphens or underscores.");
  }

  return userId;
}

function getSessionPath(userId) {
  return path.join(SESSION_ROOT, normalizeUserId(userId));
}

export function getSessionStatus(userId) {
  const session = sessions.get(userId);

  if (!session) {
    return {
      userId,
      status: "stopped",
      connected: false,
      hasQr: false
    };
  }

  return {
    userId,
    status: session.status,
    connected: session.status === "connected",
    hasQr: Boolean(session.qr),
    qr: session.qr || null,
    jid: session.jid || null
  };
}

export async function startSession(userId) {
  userId = normalizeUserId(userId);

  const existing = sessions.get(userId);
  if (existing?.status === "connected" || existing?.status === "connecting") {
    return getSessionStatus(userId);
  }

  await mkdir(getSessionPath(userId), { recursive: true });

  const { state, saveCreds } =
    await useMultiFileAuthState(getSessionPath(userId));

  const session = {
    userId,
    status: "connecting",
    qr: null,
    jid: null,
    sock: null
  };

  sessions.set(userId, session);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  session.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        session.qr = await qrcode.toDataURL(qr);
        session.status = "awaiting_qr";
        console.log(`📱 [${userId}] QR code ready.`);
      } catch (error) {
        console.error(`[${userId}] Failed to generate QR:`, error);
      }
    }

    if (connection === "open") {
      session.status = "connected";
      session.qr = null;
      session.jid = sock.user?.id || null;
      console.log(`✅ [${userId}] WhatsApp connected: ${session.jid}`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        session.status = "logged_out";
        session.qr = null;
        session.jid = null;
        session.sock = null;
        console.log(`❌ [${userId}] WhatsApp session logged out.`);
        return;
      }

      session.status = "reconnecting";
      session.qr = null;
      session.jid = null;
      session.sock = null;

      if (reconnectTimers.has(userId)) return;

      const timer = setTimeout(() => {
        reconnectTimers.delete(userId);
        startSession(userId).catch((error) => {
          console.error(`[${userId}] Reconnect failed:`, error);
        });
      }, 3000);

      reconnectTimers.set(userId, timer);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      try {
        if (!message?.message || message.key.fromMe) continue;

        const text =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          "";

        if (!text.trim()) continue;

        const source = message.key.remoteJid?.endsWith("@g.us")
          ? "group"
          : "private";

        console.log(`📩 [${userId}] [${source}] ${text}`);
        await handleCommand(sock, message, text.trim());
      } catch (error) {
        console.error(`[${userId}] Message handling error:`, error);
      }
    }
  });

  return getSessionStatus(userId);
}

export async function stopSession(userId, { logout = false } = {}) {
  userId = normalizeUserId(userId);

  const session = sessions.get(userId);
  if (!session) return getSessionStatus(userId);

  if (reconnectTimers.has(userId)) {
    clearTimeout(reconnectTimers.get(userId));
    reconnectTimers.delete(userId);
  }

  if (logout && session.sock) {
    await session.sock.logout();
  } else if (session.sock) {
    session.sock.ws?.close();
  }

  sessions.delete(userId);

  return getSessionStatus(userId);
}

export function listSessions() {
  return [...sessions.keys()].map(getSessionStatus);
}
