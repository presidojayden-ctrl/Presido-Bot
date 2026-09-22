# Presido Bot

A multi-user WhatsApp bot platform built with Node.js and Baileys.

## Accounts

Users create an account with a **username and password**, then connect their own WhatsApp account. Each user's WhatsApp credentials are isolated in their own session directory.

## Setup

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`, create an account, log in, and click **Connect WhatsApp**.

Passwords are stored as salted scrypt hashes, never plaintext. Dashboard authentication uses an HTTP-only session cookie. User data and WhatsApp credentials are excluded from Git.

For public deployment, use HTTPS. The server binds to `0.0.0.0` by default and automatically enables secure cookies when `NODE_ENV=production`; you can also set `COOKIE_SECURE=true`. Add rate limiting at the platform/reverse-proxy layer as well.

## Bot commands

- `!ping`
- `!menu`
- `!help`
- `!owner`
- `!admincheck`
- `!groupinfo`

## Architecture

- `src/auth.js` — username/password authentication.
- `src/sessionManager.js` — isolated WhatsApp sessions.
- `src/server.js` — authenticated web dashboard/API.
- `src/index.js` — application entry point.
