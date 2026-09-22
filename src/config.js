export const config = {
  botName: "Presido Bot",
  prefix: "!",
  owners: [
    // Add the WhatsApp number(s) that should have bot-owner privileges.
    // Format: country code + number, without + or spaces.
    "234XXXXXXXXXX"
  ]
};

export const isOwner = (jid) => {
  const number = jid?.split("@")[0]?.split(":")[0];
  return Boolean(number && config.owners.includes(number));
};
