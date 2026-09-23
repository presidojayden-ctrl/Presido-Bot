const JAMENDO_API = "https://api.jamendo.com/v3.0/tracks/";

export async function playTrack(sock, jid, query, quotedMessage) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    await sock.sendMessage(jid, {
      text: "🎵 Music is ready, but Presido still needs a music provider key. Add JAMENDO_CLIENT_ID in Railway, then !play will work."
    }, { quoted: quotedMessage });
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: "5",
    namesearch: query,
    type: "single albumtrack",
    audioformat: "mp32"
  });

  const response = await fetch(`${JAMENDO_API}?${params}`);
  if (!response.ok) throw new Error(`Music provider returned HTTP ${response.status}`);
  const data = await response.json();
  const track = data?.results?.find((item) => item?.audio);

  if (!track) {
    await sock.sendMessage(jid, {
      text: `🎵 I couldn't find “${query}” in the available music catalog. Try another title or artist.`
    }, { quoted: quotedMessage });
    return;
  }

  const caption = `🎵 *Presido Music*\n\n▶️ ${track.name}\n👤 ${track.artist_name || "Unknown artist"}\n\nLicensed catalog track via Jamendo.`;
  await sock.sendMessage(jid, {
    audio: { url: track.audio },
    mimetype: "audio/mpeg",
    ptt: false,
    fileName: `${track.name}.mp3`,
    caption
  }, { quoted: quotedMessage });
}

export function musicHelp() {
  return `🎵 *Presido Music*\n\n!play <song or artist> — find and send a track\n!play <another song> — send another track\n\nMusic playback is based on the configured licensed/open music catalog.`;
}
