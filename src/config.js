export const config = {
  botName: "Presido Bot",
  prefix: "!",
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
