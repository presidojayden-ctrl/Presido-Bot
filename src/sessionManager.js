import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from "@whiskeysockets/baileys";
import P from "pino";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { handleCommand } from "./commands.js";
import { maybeSendAway } from "./away.js";

const sessions = new Map();
const reconnectTimers = new Map();
const SESSION_ROOT = path.resolve(process.env.PRESIDO_SESSION_DIR || "sessions");

function normalizeUserId(userId) {
  if (!userId || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) throw new Error("Invalid userId. Use 1-64 letters, numbers, hyphens or underscores.");
  return userId;
}

function getSessionPath(userId) {
  return path.join(SESSION_ROOT, normalizeUserId(userId));
}

function normalizePhoneNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Nigerian local-number convenience: 08012345678 -> 2348012345678.
  if (digits.startsWith("0") && digits.length === 11) digits = "234" + digits.slice(1);
  return digits;
}

function bareJid(jid) {
  return jid?.split("@")[0]?.split(":")[0] || "";
}

function formatPairingError(error) {
  return error?.message || error?.data?.message || String(error);
}

function getSessionStatus(userId) {
  const session = sessions.get(userId);
  if (!session) {
    return {
      userId,
      status: "stopped",
      connected: false,
      hasPairingCode: false,
      pairingCode: null,
      pairingError: null,
      qrCode: null,
      jid: null
    };
  }
  return {
    userId,
    status: session.status,
    connected: session.status === "connected",
    hasPairingCode: Boolean(session.pairingCode),
    pairingCode: session.pairingCode || null,
    pairingError: session.pairingError || null,
    qrCode: session.qrCode || null,
    jid: session.jid || null
  };
}

export { getSessionStatus };

async function requestPairingCode(session, sock, phoneNumber, state, userId) {
  if (state.creds.registered || session.pairingRequested || !phoneNumber) return;

  session.pairingRequested = true;
  session.pairingError = null;
  session.status = "awaiting_pairing";

  try {
    // Baileys requires the full international number, digits only.
    const code = await sock.requestPairingCode(phoneNumber);
    session.pairingCode = code;
    session.status = "awaiting_pairing";
    console.log(`📱 [${userId}] WhatsApp pairing code ready for ${phoneNumber}: ${code}`);
  } catch (error) {
    session.pairingCode = null;
    session.pairingError = formatPairingError(error);
    session.status = session.qrCode ? "awaiting_qr" : "pairing_failed";
    console.error(`[${userId}] Pairing code request failed for ${phoneNumber}:`, error);
  }
}

export async function startSession(userId, phoneNumber) {
  userId = normalizeUserId(userId);
  const existing = sessions.get(userId);
  if (existing?.status === "connected" || existing?.status === "connecting" || existing?.status === "awaiting_pairing" || existing?.status === "awaiting_qr") {
    return getSessionStatus(userId);
  }

  const digits = normalizePhoneNumber(phoneNumber);

  await mkdir(getSessionPath(userId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(getSessionPath(userId));

  if (!state.creds.registered && !/^\d{8,15}$/.test(digits)) {
    throw new Error("Enter a valid WhatsApp number in international format. Example: 2348012345678");
  }

  const session = {
    userId,
    status: "connecting",
    pairingCode: null,
    pairingError: null,
    qrCode: null,
    jid: null,
    sock: null,
    pairingRequested: false
  };
  sessions.set(userId, session);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Presido Bot")
  });

  session.sock = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        session.qrCode = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        session.status = session.pairingCode ? "awaiting_pairing" : "awaiting_qr";
      } catch (error) {
        console.error(`[${userId}] QR generation failed:`, error);
      }
    }

    // Pairing codes are requested only after WhatsApp has started connecting.
    if ((connection === "connecting" || qr) && !state.creds.registered) {
      await requestPairingCode(session, sock, digits, state, userId);
    }

    if (connection === "open") {
      session.status = "connected";
      session.pairingCode = null;
      session.pairingError = null;
      session.qrCode = null;
      session.jid = sock.user?.id || null;
      console.log(`✅ [${userId}] WhatsApp connected: ${session.jid}`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        session.status = "logged_out";
        session.pairingCode = null;
        session.pairingError = null;
        session.qrCode = null;
        session.jid = null;
        session.sock = null;
        console.log(`❌ [${userId}] WhatsApp session logged out.`);
        return;
      }

      session.status = "reconnecting";
      session.pairingCode = null;
      session.pairingError = null;
      session.qrCode = null;
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
        if (!message?.message) continue;

        const remoteJid = message.key.remoteJid;
        const ownJid = bareJid(sock.user?.id);
        const selfChat = Boolean(message.key.fromMe && remoteJid?.endsWith("@s.whatsapp.net") && bareJid(remoteJid) === ownJid);

        // Ignore normal outgoing messages, but deliberately allow commands typed
        // into the bot's own "Message yourself" chat for health checks.
        if (message.key.fromMe && !selfChat) continue;

        const text = message.message.conversation || message.message.extendedTextMessage?.text || "";
        if (!text.trim()) continue;

        const source = remoteJid?.endsWith("@g.us") ? "group" : selfChat ? "self" : "private";
        console.log(`📩 [${userId}] [${source}] ${text}`);

        const awayReplied = await maybeSendAway(userId, sock, message, text.trim());
        if (awayReplied) continue;

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
  if (reconnectTimers.has(userId)) { clearTimeout(reconnectTimers.get(userId)); reconnectTimers.delete(userId); }
  if (logout && session.sock) await session.sock.logout(); else if (session.sock) session.sock.ws?.close();
  sessions.delete(userId);
  return getSessionStatus(userId);
}

export function listSessions() {
  return [...sessions.keys()].map(getSessionStatus);
}
