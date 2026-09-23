import { config, isOwner } from "./config.js";
import { getAwaySettings, updateAwaySettings } from "./away.js";
import { playTrack, musicHelp } from "./music.js";

const getSenderJid = (message) =>
  message.key.participant || message.key.remoteJid;

const isGroupMessage = (message) =>
  message.key.remoteJid?.endsWith("@g.us");

async function getGroupMetadata(sock, jid) {
  if (!jid?.endsWith("@g.us")) return null;
  try {
    return await sock.groupMetadata(jid);
  } catch {
    return null;
  }
}

function isGroupAdmin(metadata, jid) {
  if (!metadata || !jid) return false;
  const participant = metadata.participants.find((p) => p.id === jid);
  return participant?.admin === "admin" || participant?.admin === "superadmin";
}

function formatAway(settings) {
  return `🤖 *Presido Away Mode*

Status: ${settings.enabled ? "🟢 ON" : "⚪ OFF"}
Groups: ${settings.groupsEnabled ? "🟢 ON" : "⚪ OFF"}
Quiet contact window: ${settings.quietDays} days
Reply cooldown: ${settings.cooldownHours} hours

Message:
“${settings.message}”`;
}

export async function handleCommand(sock, message, text) {
  const jid = message.key.remoteJid;
  if (!text.startsWith(config.prefix)) return;

  const args = text.slice(config.prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  const senderJid = getSenderJid(message);
  const owner = isOwner(senderJid, sock.user?.id);
  const group = isGroupMessage(message);
  const metadata = group ? await getGroupMetadata(sock, jid) : null;
  const groupAdmin = group && isGroupAdmin(metadata, senderJid);
  const reply = (value) => sock.sendMessage(jid, { text: value }, { quoted: message });

  switch (command) {
    case "ping":
      await reply("🏓 Pong! Presido Bot is online.");
      break;

    case "menu":
    case "help":
      await sock.sendMessage(jid, {
        image: { url: "https://raw.githubusercontent.com/presidojayden-ctrl/Presido-Bot/main/web/presido-logo.svg" },
        caption: `╭━━━〔 🤖 ${config.botName} 〕━━━╮
┃
┃  👋 Welcome to *${config.botName}*
┃  Your WhatsApp automation assistant.
┃
┃  🌐 Website
┃  https://presidobot.netlify.app
┃
┃  ⚙️ Mode: Personal assistant
┃  🧩 Version: 1.2.0
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

📌 *Commands*

General
• !ping — Check if Presido is online
• !menu — Show this menu
• !play <song> — Play/send music

Away Mode
• !away on — Turn auto-replies on
• !away off — Turn auto-replies off
• !away status — Show Away Mode settings
• !away message <text> — Change the reply
• !away groups on/off — Group replies
• !away days <number> — Quiet contact window
• !away cooldown <hours> — Reply cooldown

Admin
• !groupinfo — Show group information
• !admincheck — Check your group admin status

Owner
• !owner — Check whether you are Presido's owner

💚 Powered by ${config.botName}`
      }, { quoted: message });
      break;

    case "play":
    case "music":
      if (!args.length) return reply(musicHelp());
      await playTrack(sock, jid, args.join(" "), message);
      break;

    case "away": {
      if (!owner) return reply("🔒 Away Mode can only be controlled by Presido.");
      const action = args.shift()?.toLowerCase();
      const current = await getAwaySettings(sock.user?.id || senderJid);

      if (!action || action === "status") {
        return reply(formatAway(current));
      }
      if (action === "on" || action === "off") {
        const updated = await updateAwaySettings(sock.user?.id || senderJid, { enabled: action === "on" });
        return reply(`🤖 Away Mode is now *${updated.enabled ? "ON" : "OFF"}*.`);
      }
      if (action === "message") {
        const messageText = args.join(" ").trim();
        if (!messageText) return reply("Usage: !away message <your message>");
        const updated = await updateAwaySettings(sock.user?.id || senderJid, { message: messageText });
        return reply(`✅ Away message updated:\n\n“${updated.message}”`);
      }
      if (action === "groups") {
        const value = args.shift()?.toLowerCase();
        if (!["on", "off"].includes(value)) return reply("Usage: !away groups on/off");
        const updated = await updateAwaySettings(sock.user?.id || senderJid, { groupsEnabled: value === "on" });
        return reply(`👥 Group Away Mode is now *${updated.groupsEnabled ? "ON" : "OFF"}*.`);
      }
      if (action === "days") {
        const days = Number(args.shift());
        if (!Number.isFinite(days) || days < 0 || days > 365) return reply("Usage: !away days <0-365>");
        const updated = await updateAwaySettings(sock.user?.id || senderJid, { quietDays: days });
        return reply(`🕒 New-contact quiet window: *${updated.quietDays} days*.`);
      }
      if (action === "cooldown") {
        const hours = Number(args.shift());
        if (!Number.isFinite(hours) || hours < 1 || hours > 168) return reply("Usage: !away cooldown <1-168>");
        const updated = await updateAwaySettings(sock.user?.id || senderJid, { cooldownHours: hours });
        return reply(`⏱️ Away reply cooldown: *${updated.cooldownHours} hours*.`);
      }
      return reply("Usage: !away on/off/status/message/groups/days/cooldown");
    }

    case "owner":
      await reply(owner
        ? "👑 You are Presido Bot's owner."
        : "❌ This WhatsApp account is not the configured Presido owner.");
      break;

    case "admincheck":
      if (!group) return reply("⚠️ This command can only be used in a group.");
      await reply(groupAdmin
        ? "🛡️ You are a group admin."
        : "ℹ️ You are not a group admin.");
      break;

    case "groupinfo":
      if (!group) return reply("⚠️ This command can only be used in a group.");
      if (!groupAdmin && !owner) {
        return reply("❌ Only group admins or Presido can use this command.");
      }
      await reply(`👥 *Group Info*

Name: ${metadata?.subject || "Unknown"}
Members: ${metadata?.participants?.length || 0}
Group ID: ${jid}`);
      break;

    default:
      await reply(`❌ Unknown command: ${command}

Type !menu to see available commands.`);
  }
}
