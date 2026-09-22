import { config } from "./config.js";

export async function handleCommand(sock, message, text) {
  const jid = message.key.remoteJid;
  if (!text.startsWith(config.prefix)) return;

  const args = text.slice(config.prefix.length).trim().split(/\\s+/);
  const command = args.shift()?.toLowerCase();

  switch (command) {
    case "ping":
      await sock.sendMessage(jid, { text: "🏓 Pong! Presido Bot is online." });
      break;
    case "menu":
    case "help":
      await sock.sendMessage(jid, { text: "🤖 *Presido Bot*\n\nAvailable commands:\n\n!ping - Check if the bot is online\n!menu - Show available commands\n!help - Show this help message" });
      break;
    default:
      await sock.sendMessage(jid, { text: `❌ Unknown command: ${command}\n\nType !menu to see available commands.` });
  }
}
