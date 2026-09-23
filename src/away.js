import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.env.PRESIDO_DATA_DIR || "data");
const cache = new Map();

const DEFAULTS = {
  enabled: false,
  message: "Presido is unavailable right now. When she is back, she will respond to you. Thank you 💕",
  cooldownHours: 12,
  quietDays: 7,
  groupsEnabled: true
};

function safeId(userId) {
  return String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function filePath(userId) {
  return path.join(DATA_DIR, `away-${safeId(userId)}.json`);
}

async function load(userId) {
  if (cache.has(userId)) return cache.get(userId);
  let state = { ...DEFAULTS };
  try {
    const raw = await fs.readFile(filePath(userId), "utf8");
    state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  cache.set(userId, state);
  return state;
}

async function save(userId, state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  cache.set(userId, state);
  await fs.writeFile(filePath(userId), JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function getAwaySettings(userId) {
  return { ...(await load(userId)) };
}

export async function updateAwaySettings(userId, patch) {
  const state = { ...(await load(userId)), ...patch };
  return save(userId, state);
}

export async function processAwayMessage(userId, message, text, ownerJid) {
  const state = await load(userId);
  const remoteJid = message?.key?.remoteJid;
  if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast")) return false;

  const senderJid = message.key.participant || remoteJid;
  if (message.key.fromMe || !state.enabled || senderJid === ownerJid) return false;

  const now = Date.now();
  const group = remoteJid.endsWith("@g.us");
  const contactKey = group ? remoteJid : senderJid;
  const previous = Number(state.contacts?.[contactKey] || 0);

  state.contacts = state.contacts || {};
  state.lastReply = state.lastReply || {};

  const shouldReply = group
    ? state.groupsEnabled && /\bpresido\b|\bpresido\s*bot\b/i.test(text || "")
    : !previous || now - previous >= state.quietDays * 24 * 60 * 60 * 1000;

  state.contacts[contactKey] = now;

  if (!shouldReply) {
    await save(userId, state);
    return false;
  }

  const lastReplyAt = Number(state.lastReply[contactKey] || 0);
  if (lastReplyAt && now - lastReplyAt < state.cooldownHours * 60 * 60 * 1000) {
    await save(userId, state);
    return false;
  }

  state.lastReply[contactKey] = now;
  await save(userId, state);
  await message.sock?.sendMessage?.(remoteJid, { text: state.message });
  return true;
}

export async function maybeSendAway(userId, sock, message, text) {
  const state = await load(userId);
  const remoteJid = message?.key?.remoteJid;
  if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast")) return false;
  const ownerJid = sock.user?.id || null;
  if (message.key.fromMe || !state.enabled || !ownerJid) return false;

  const senderJid = message.key.participant || remoteJid;
  if (senderJid === ownerJid) return false;

  const now = Date.now();
  const group = remoteJid.endsWith("@g.us");
  const contactKey = group ? remoteJid : senderJid;
  const previous = Number(state.contacts?.[contactKey] || 0);

  state.contacts = state.contacts || {};
  state.lastReply = state.lastReply || {};

  const shouldReply = group
    ? state.groupsEnabled && /\bpresido\b|\bpresido\s*bot\b/i.test(text || "")
    : !previous || now - previous >= state.quietDays * 24 * 60 * 60 * 1000;

  state.contacts[contactKey] = now;

  if (!shouldReply) {
    await save(userId, state);
    return false;
  }

  const lastReplyAt = Number(state.lastReply[contactKey] || 0);
  if (lastReplyAt && now - lastReplyAt < state.cooldownHours * 60 * 60 * 1000) {
    await save(userId, state);
    return false;
  }

  state.lastReply[contactKey] = now;
  await save(userId, state);
  await sock.sendMessage(remoteJid, { text: state.message });
  return true;
}
