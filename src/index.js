import { readdir } from "node:fs/promises";
import path from "node:path";
import { startSession } from "./sessionManager.js";
import "./server.js";

const SESSION_ROOT = path.resolve("sessions");
const defaultUserId = process.env.PRESIDO_DEFAULT_USER_ID;

async function restoreSessions() {
  let restored = 0;

  try {
    const entries = await readdir(SESSION_ROOT, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.name)) {
        continue;
      }

      await startSession(entry.name);
      restored += 1;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (defaultUserId && !/^[a-zA-Z0-9_-]{1,64}$/.test(defaultUserId)) {
    throw new Error("PRESIDO_DEFAULT_USER_ID must contain only letters, numbers, hyphens or underscores.");
  }

  if (defaultUserId && !entries.some((entry) => entry.isDirectory() && entry.name === defaultUserId)) {
    await startSession(defaultUserId);
  }

  if (restored === 0 && !defaultUserId) {
    console.log("ℹ️ No saved WhatsApp sessions found.");
    console.log("Use the dashboard to create a user session.");
  }
}

restoreSessions().catch((error) => {
  console.error("❌ Failed to restore WhatsApp sessions:", error);
  process.exit(1);
});
