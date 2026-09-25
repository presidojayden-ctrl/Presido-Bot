export const config = {
  botName: "Presido Bot",
  version: "1.2.0",
  prefix: "?",
  prefixes: ["?", "!"],
  website: "https://presidobot.netlify.app",
  channel: process.env.PRESIDO_CHANNEL_URL || "Not configured yet",
  logo: "https://raw.githubusercontent.com/presidojayden-ctrl/Presido-Bot/main/web/presido-logo.svg",
  owners: [
    "234XXXXXXXXXX"
  ]
};

export const normalizeJidNumber = (jid) =>
  jid?.split("@")[0]?.split(":")[0] || "";

export const isOwner = (jid, connectedOwnerJid = null) => {
  const number = normalizeJidNumber(jid);
  const connectedOwner = normalizeJidNumber(connectedOwnerJid);
  return Boolean(
    number &&
    ((connectedOwner && number === connectedOwner) || config.owners.includes(number))
  );
};
