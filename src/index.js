import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import P from "pino";
import qrcode from "qrcode-terminal";
import { handleCommand } from "./commands.js";

async function startBot() {
  console.log("🚀 Starting Presido Bot...");
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const sock = makeWASocket({ auth: state, logger: P({ level: "silent" }), printQRInTerminal: false });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n📱 Scan this QR code with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") console.log("✅ Presido Bot connected to WhatsApp.");
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ WhatsApp session logged out.");
        return;
      }
      console.log("⚠️ Connection closed. Reconnecting...");
      startBot().catch(console.error);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const message = messages[0];
      if (!message?.message || message.key.fromMe) return;
      const text = message.message.conversation || message.message.extendedTextMessage?.text || "";
      if (!text.trim()) return;
      console.log(`📩 ${text}`);
      await handleCommand(sock, message, text.trim());
    } catch (error) {
      console.error("Message handling error:", error);
    }
  });
}

startBot().catch((error) => {
  console.error("❌ Failed to start bot:", error);
  process.exit(1);
});
