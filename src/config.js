export const config = {
  botName: "Presido Bot",
  prefix: "!",
  owners: [
    "234XXXXXXXXXX"
  ]
};

export const isOwner = (jid) => {
  const number = jid?.split("@")[0]?.split(":")[0];
  return Boolean(number && config.owners.includes(number));
};
