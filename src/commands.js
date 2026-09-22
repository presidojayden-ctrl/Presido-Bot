import { config, isOwner } from "./config.js";

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

export async function handleCommand(sock, message, text) {
  const jid = message.key.remoteJid;
  if (!text.startsWith(config.prefix)) return;

  const args = text.slice(config.prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  const senderJid = getSenderJid(message);
  const owner = isOwner(senderJid);
  const group = isGroupMessage(message);
  const metadata = group ? await getGroupMetadata(sock, jid) : null;
  const groupAdmin = group && isGroupAdmin(metadata, senderJid);

  const reply = (value) => sock.sendMessage(jid, { text: value });

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
┃  📢 Channel
┃  Not configured yet
┃
┃  ⚙️ Mode: Public
┃  🧩 Version: ${config.version || "1.1.0"}
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

📌 *Commands*

General
• !ping — Check if the bot is online
• !menu — Show this menu
• !help — Show this menu

Admin
• !groupinfo — Show group information
• !admincheck — Check your group admin status

Owner
• !owner — Check whether you are a bot owner

💚 Powered by ${config.botName}`
      }, { quoted: message });
      break;

    case "owner":
      await reply(owner
        ? "👑 You are a configured Presido Bot owner."
        : "❌ You are not configured as a bot owner.");
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
        return reply("❌ Only group admins or the bot owner can use this command.");
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
