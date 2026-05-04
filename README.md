# MobileClient

A mobile-web client for per-user Twilio voice + SMS. Each authenticated user
gets their own Twilio phone number and communicates with contacts from it.
Phone-OTP signup, real-time call transcription, and per-user SMS threads.

Server: Node/Express + SQLite. Client: static HTML/JS (no framework, no
bundler).

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/)
- A Twilio account with Voice + SMS capabilities
- An ngrok tunnel (or any public `https://…` URL) so Twilio can reach the
  server for webhooks

## Quick start

```bash
cd server
pnpm install
cp .env.example .env          # fill in Twilio creds + OTP_FROM_NUMBER
ngrok http --url=<your-domain> 3001
node server.js                # first boot runs DB migrations + seed
```

Then open `https://<your-domain>/signup` and walk through the OTP flow. The
app lands you at `/` after signup.

## Configuration

See [server/.env.example](server/.env.example) for the full list. The
important ones:

| Var | Purpose |
|---|---|
| `SERVER_BASE_URL` | Public `https://…` URL for Twilio webhooks |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Account creds (REST + webhook sig validation) |
| `TWILIO_API_KEY`, `TWILIO_API_SECRET` | Voice SDK AccessToken minting |
| `TWIML_APP_SID` | Voice URL points at `{SERVER_BASE_URL}/voice/outgoing` |
| `OTP_FROM_NUMBER` | Dedicated Twilio number that sends signup OTPs |
| `TWILIO_COUNTRY_CONFIG_<ISO>_*` | Per-country number provisioning config |
| `TRANSCRIPTION_ENGINE` (optional) | `google` or `deepgram`. Unset = feature disabled |
| `TRANSCRIPTION_LANGUAGE_CODE` (optional) | e.g. `en-AU`, `en-US`. Defaults to `en-US` |

## Features

- **Phone-OTP signup/signin** — 6-digit SMS code, 5-attempt lockout, automatic
  Twilio number provisioning on first signup (country picked from the user's
  E.164 prefix).
- **Voice (PSTN ↔ browser)** — browser-initiated outbound calls via the Voice
  SDK; inbound PSTN calls ring the browser via `<Dial><Client>`. Activity
  logged per call with duration.
- **Real-time transcription** — optional. When `TRANSCRIPTION_ENGINE` is set,
  every PSTN call gets transcribed via Twilio's `<Transcription>` TwiML verb.
  Utterances are persisted as they arrive and rendered as message-style
  bubbles in the call-detail view (caller on the left, user on the right).
- **SMS** — plain Twilio Programmable Messaging. Per-number `smsUrl` routes
  inbound SMS to `/webhooks/messaging/inbound`. Outbound sends use
  `client.messages.create({ from: user.twilioNumber, body })` with delivery
  status callbacks.
- **Per-user data isolation** — every row in every table is scoped by
  `user_guid`; every query filters by the user GUID in the URL path.
- **Server-sent events** — per-user SSE channel at `GET /events/:userGuid`
  pushes `message.added`, `message.status`, `activity.added`, and
  `incoming-call` events to the client in real time.

## Architecture overview

See [CLAUDE.md](CLAUDE.md) for the full architecture doc. At a glance:

```
Browser (static JS/HTML)  ──HTTP──▶  Express (server/server.js)
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                          ▼               ▼               ▼
                      SQLite        Twilio Voice   Twilio Messaging
                   (app.db, WAL)      + SDK           (SMS API)
```

All entities are scoped by `user_guid` (UUIDv4). Schema + migrations live in
[server/db/database.js](server/db/database.js). All Twilio webhooks are
signature-validated via `validateTwilioRequest` middleware.

## Scripts

```bash
cd server
pnpm start           # node server.js
pnpm run dev         # nodemon server.js (auto-reload on change)
```

The seed at [server/db/seed.js](server/db/seed.js) runs once on first boot
when `users` is empty. Real signups coexist with seed users; the seed does
not re-run once any user exists.

## Deployment

See [.claude/plans/flyio-deployment.md](.claude/plans/flyio-deployment.md)
for Fly.io deployment notes (used on the private `aussie` branch).

## Known limitations

- **SSE through mobile suspension** — live push is unreliable when the tab
  backgrounds on mobile Safari. The message and main views re-hydrate on
  `visibilitychange → visible` to catch up.
- **No pagination** — main list, activity feed, and message thread all return
  everything for the user.
- **No refresh tokens** — session ends when the browser closes.
- **Transcription cost** — ~$0.027/min per call when enabled. Leave
  `TRANSCRIPTION_ENGINE` unset to disable.

For detailed architecture, webhook flows, client conventions, and
troubleshooting, see [CLAUDE.md](CLAUDE.md).
