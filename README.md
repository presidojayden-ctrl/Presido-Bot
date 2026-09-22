# Presido Bot

A multi-user WhatsApp bot platform built with Node.js and Baileys.

## Multi-user sessions

Each connected WhatsApp account gets its own isolated authentication directory:

```
sessions/
  user_001/
  user_002/
  user_003/
```

One session can reconnect without affecting the others.

## Setup

```bash
npm install
npm start
```

By default the local connection dashboard is available at:

```
http://127.0.0.1:3000
```

Enter a unique user ID, click **Connect WhatsApp**, and scan the displayed QR code with:

**WhatsApp → Settings → Linked Devices → Link a Device**

For a production deployment, put authentication in front of the dashboard/API before exposing it to the public internet. The current dashboard is intentionally a local development interface.

### Optional default session

Set `PRESIDO_DEFAULT_USER_ID` to automatically start one session when the server starts:

```bash
PRESIDO_DEFAULT_USER_ID=owner_001 npm start
```

## Current commands

- `!ping` — Check that the bot is online.
- `!menu` — Show available commands.
- `!help` — Show help.
- `!owner` — Check whether the sender is a configured bot owner.
- `!admincheck` — Check group admin status.
- `!groupinfo` — Show group information to group admins or the bot owner.

## Architecture

- `src/sessionManager.js` — Creates and manages isolated WhatsApp sessions.
- `src/server.js` — Local web dashboard and session API.
- `src/index.js` — Application entry point.
- `src/commands.js` — Bot command handling.
- `src/config.js` — Bot configuration and owner settings.

Session credentials are stored under `sessions/` and excluded from Git.
