import { startSession } from "./sessionManager.js";
import "./server.js";

const defaultUserId = process.env.PRESIDO_DEFAULT_USER_ID;

if (defaultUserId) {
  startSession(defaultUserId).catch((error) => {
    console.error("❌ Failed to start default WhatsApp session:", error);
    process.exit(1);
  });
} else {
  console.log("ℹ️ No default WhatsApp session configured.");
  console.log("Use the dashboard to create a user session.");
}
