# MobileClient Architecture

A mobile-web client for per-user Twilio voice + SMS. Each authenticated user
has their own Twilio phone number and communicates with contacts from it.
The server is a single Node/Express process backed by SQLite; the client is
static HTML/JS served from `client/`.

No front-end framework, no bundler — plain ES modules and `fetch` + SSE.

## Core entities

All entities are scoped by `user_guid` (UUIDv4). FK cascade on user delete.

- **User** — `user_guid`, `name`, `phone` (E.164, unique), `twilio_number`,
  `twilio_number_sid`, `created`. See [database.js:25](server/db/database.js#L25).
- **Contact** — `contact_guid`, `user_guid`, `first_name`, `last_name`,
  `company`, `photo_data` (base64). Plus `contact_identities` rows
  (`type ∈ {Phone, Message, WhatsApp, SIP, Client}`, `value`).
- **Activity** — one row per interaction. `type ∈ {Phone, Message, WhatsApp,
  Contact}`, `datetime`, `duration` (minutes; 0 = audit marker), `identity_value`,
  `contact_guid` (nullable — inbound from unknown numbers is common).
- **Thread** — `thread_id` (local `thr_<uuid>`), `user_guid`, `contact_guid`,
  `remote_address`, `proxy_address` (user's Twilio number), `activity_id`.
- **Message** — `message_sid` (Twilio SMxxx), `thread_id`, `direction`, `author`,
  `body`, `datetime`.

## Auth

Phone-OTP only. No passwords, no email/password.

1. `POST /auth/send-otp` → `AuthService.requestOtp` generates a 6-digit code,
   stores sha256 hash in `otp_verifications`, sends SMS via
   `client.messages.create({ to, from: OTP_FROM_NUMBER })`.
2. `POST /auth/verify-otp` — constant-time check with 5-attempt lockout.
3. `POST /auth/complete` — existing phone → signin (return `userGUID`);
   new phone → create user + provision a Twilio number via
   `TwilioNumberService.provisionForUser` (country picked from E.164 prefix).

The client stores `userGUID`, `userPhone`, `userName` in `sessionStorage`
after signin. Every API call URL-encodes the `userGUID` in the path. There
is no bearer token; the server trusts the path param and scopes all queries
by it. See [phone-otp-signup.md](.claude/plans/phone-otp-signup.md) for the
design context.

`OTP_FROM_NUMBER` is a single dedicated sender — per-user numbers can't send
the OTP because they don't exist until *after* verification.

## Voice (Twilio Voice SDK)

- Outbound: browser gets an AccessToken from `POST /voice/token`, calls
  `Device.connect({ params: { userGuid, To, destinationType, ... } })`. Twilio
  hits `POST /voice/outgoing` (the TwiML App Voice URL) which returns TwiML
  that dials the right destination. `destinationType` switches between
  `phone` (PSTN), `assistant` (AI `<Connect><Assistant>`), `flex` (TaskRouter
  `<Enqueue>`), or `custom` (arbitrary SIP URI).
- Inbound (PSTN → browser): when someone calls the user's provisioned number,
  Twilio hits `POST /voice/incoming`, we look up the owner by `To`, return
  TwiML that dials `<Client>{userGuid}</Client>`. The browser's Device fires
  an incoming-call event; the UI shows it.
- Activity logging: `/voice/outgoing` registers the outbound CallSid with
  `WebhookService.registerCallBySid` and `/voice/incoming` registers via
  `registerIncomingCall`. Twilio's `POST /webhooks/voice/status` is the
  authoritative "call ended" signal — `handleVoiceStatus` inserts the Phone
  activity on `CallStatus=completed` (or `DialCallStatus=completed` for the
  child leg).

See [CLAUDE-VoiceSDK.md](.claude/plans/CLAUDE-VoiceSDK.md).

## Messaging (SMS)

Plain Twilio Programmable Messaging — no Messaging Service, no Conversations
API. Each user's provisioned number has its `smsUrl` set directly at purchase
time.

- Outbound: `POST /messaging/send` → `MessagingService.sendMessage` →
  `client.messages.create({ to, from: user.twilioNumber, body })`. Result
  persisted to `messages` immediately with the returned SMxxx as PK.
- Inbound: Twilio hits `POST /webhooks/messaging/inbound` on the per-number
  `smsUrl`; `WebhookService.handleInboundSms` finds the owning user by `To`,
  `ensureThread`s, inserts the message (idempotent on SMxxx PK).
- Thread model: keyed locally by `(user_guid, proxy_address, remote_address)`
  with a unique index ([database.js:83](server/db/database.js#L83)).
- First message in a thread auto-creates a `Message` activity linked via
  `threads.activity_id` — subsequent messages don't duplicate the activity.

See [CLAUDE-MessagingSDK.md](.claude/plans/CLAUDE-MessagingSDK.md).

## Real-time updates (SSE)

Per-user server-push via `GET /events/:userGuid`. [SseService](server/services/SseService.js)
holds `Map<userGuid, Set<res>>` and broadcasts scoped to one user:

- `activity.added` — fired via `ContactService.emit('activityAdded', ...)`
  whenever any activity is inserted (phone call, message, contact add).
- `message.added` — fired by `MessagingService.sendMessage` (outbound) and
  `WebhookService.handleInboundSms` (inbound).
- `incoming-call` — fired by `WebhookService.registerIncomingCall`.

SSE is best-effort. Mobile browsers (iOS Safari in particular) suspend
long-lived connections when the tab backgrounds; events delivered during the
suspension are lost. The message view handles this by re-hydrating the
thread on `visibilitychange` → `visible` — `appendMessage` dedups on
`messageSid` so replay is idempotent. See [message.js:232-238](client/view/message/message.js#L232-L238).

## Client caching

`sessionStorage` is the only client cache. Relevant keys:

- `userGUID`, `userPhone`, `userName` — session identity, set on signin
- `currentContact` / `contactTimestamp` — passed between views when navigating
  into a contact-scoped action (call, message, WhatsApp)
- `mainListCache` + `mainListCacheTimestamp` — 5-min TTL cache for the home
  screen list. Invalidated on contact create and on the main view's
  `activity.added` SSE handler (which does an in-place merge).
- `contacts` — legacy per-phone dictionary written by the contact form.

There is **no client-side auth token cache**. The `userGUID` in sessionStorage
is the identity; it's pushed into request paths, not headers.

## Server layout

```
server/
├── server.js                          # Express app, all routes
├── db/
│   ├── database.js                    # SQLite schema + migrations
│   └── seed.js                        # Idempotent dev seed (skip if users > 0)
├── services/
│   ├── AuthService.js                 # Phone-OTP signup/signin
│   ├── UserServices.js                # User CRUD
│   ├── ContactServices.js             # Contacts + activities + EventEmitter
│   ├── TwilioNumberService.js         # Per-user number provision/release
│   ├── VoiceServices.js               # AccessToken + TwiML generation
│   ├── MessagingService.js            # SMS send + thread ensure
│   ├── MessagesRepository.js          # threads + messages DAO
│   ├── WebhookService.js              # Voice status + inbound SMS handlers
│   └── SseService.js                  # Per-user SSE fanout
└── scripts/
    └── migrate-detach-numbers.js      # One-shot: detach numbers from MS pool
```

## Key routes

| Route                                 | Purpose |
|---------------------------------------|---------|
| `POST /auth/send-otp`                 | Send OTP to `{phone}` |
| `POST /auth/verify-otp`               | Check OTP, return `{ verified, isExistingUser }` |
| `POST /auth/complete`                 | Sign-in or create user + provision number |
| `GET  /users/:userGuid`               | Session validation |
| `GET  /main-list/:userGuid`           | Home-screen roster (contacts + unknown identities, ranked by last interaction) |
| `GET  /activities/:userGuid[/by-contact/:cg\|/by-identity/:iv]` | Activity feed variants |
| `POST /contacts/:userGuid`            | Create contact (fires Contact activity) |
| `POST /messaging/send`                | Outbound SMS |
| `GET  /messaging/thread/:userGuid?to=`| Thread hydration |
| `POST /webhooks/messaging/inbound`    | Per-number inbound SMS from Twilio |
| `POST /voice/token`                   | AccessToken for Voice SDK |
| `POST /voice/outgoing`                | TwiML for outbound browser calls |
| `POST /voice/incoming`                | TwiML for inbound PSTN → `<Client>` |
| `POST /webhooks/voice/status`         | Twilio voice status callback |
| `GET  /events/:userGuid`              | SSE server-push |

All webhook routes are gated by `validateTwilioRequest` — HMAC-signed via
`TWILIO_AUTH_TOKEN`. The middleware is a no-op when the token is unset (dev
without ngrok stability).

## Environment

See [.env.example](server/.env.example). Required:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`
- `SERVER_BASE_URL` (public URL; must be `https://…` for webhook signature validation)
- `TWIML_APP_SID`, `OTP_FROM_NUMBER`
- `TWILIO_COUNTRY_CONFIG_<ISO>_TYPE` + bundle/address pair per supported country

## Dev workflow

```
cd server && pnpm install
cp .env.example .env              # fill values
ngrok http --url=<your-domain> 3001
node server.js                    # first boot runs DB migrations + seed
```

Open `https://<ngrok>/signup` → OTP signup → app loads at `/`.

## Known limitations

- **SSE through mobile suspension** — live push is unreliable when tabs
  background. Views that display real-time data should re-hydrate on
  `visibilitychange` → `visible`. `message.js` does; `ActivityList.js` does
  not yet (follow-up).
- **No pagination** — main list, activity feed, and message thread all return
  everything for the user. Fine at current scale; not for 10k+ messages.
- **No refresh tokens** — `sessionStorage` session ends when the browser
  closes; user re-runs OTP. Acceptable for a mobile-web demo.
- **Seed data is dev-only** — `seed.js` inserts 2 dummy users the first time
  the DB is empty. Real signups coexist with seed users; seed does not
  re-run when real users exist.
