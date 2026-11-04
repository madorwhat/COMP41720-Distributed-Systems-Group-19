# Notification Service

Sends the Book My Visa emails, all through Gmail:

- **Confirmation**: as soon as Booking says a booking is confirmed.
- **Reminder**: at 9 am Irish time on the day before the appointment.
- **New appointments are open**: when an admin adds slots, the people who subscribed to that country and visa type are told, and nobody else.

Stack: Node 22, Express 5, Sequelize 6, PostgreSQL, RabbitMQ (amqplib), nodemailer, node-cron, prom-client.

## Three ways work reaches this service

| | What arrives | Code | What it does |
|---|---|---|---|
| **1. Messages from Booking** | `BookingConfirmed` and `SlotsOpened`, on RabbitMQ | [`src/consumer/`](src/consumer) | Sends the confirmation email, or the "new appointments are open" emails |
| **2. Web routes** | A user choosing what to be told about: `/subscriptions` | [`src/routes/`](src/routes) | Saves the choice (login required) |
| **3. A timer** | Every 15 minutes | [`src/reminders/`](src/reminders) | Sends the reminder emails that are due |

Plus `GET /health` and `GET /metrics`. The messages Booking has to publish are described in [EVENTS.md](EVENTS.md).

```
src/
  server.js           starts the three things above
  consumer/             index.js (listens, retries, dead-letters), messages.js (the two message
                        formats), booking-confirmed.js, slots-opened.js (one handler each)
  routes/               subscriptions.js (the routes), auth.js (checks the login token)
  reminders/            index.js (the timer and the sending), time.js (Irish-time maths)
  config.js  db.js  mailer.js  metrics.js  choices.js     shared: settings, tables, email, numbers, valid countries and visa types
db/migrations/        the three tables: notifications, slot_alerts, slot_subscriptions
scripts/              publish-test-event.js (a fake Booking), send-test-mail.js (checks the Gmail login)
test/                 unit tests (`npm test`)
```

## Run it

First set up the Gmail login (next section): the service stops at startup with a clear message without it. Then:

```bash
cd backend/notification-service
docker compose up --build
```

| What | Where |
|---|---|
| Health and metrics | http://localhost:4003/health, http://localhost:4003/metrics |
| Subscriptions API | http://localhost:4003/subscriptions (needs a login token) |
| RabbitMQ UI | http://localhost:15672 (`guest` / `guest`) |
| Database | `localhost:5435`, `notification_db`, user and password `notification` |

If a port is taken, set `NOTIFICATION_HOST_PORT`, `NOTIFICATION_DB_HOST_PORT`, `RABBITMQ_HOST_PORT` or `RABBITMQ_UI_HOST_PORT` (in `.env` or in front of the command). To run outside Docker: keep the other containers running, then `npm install`, `cp .env.example .env` (and fill in the Gmail login) and `npm run dev`.

### Email setup (Gmail)

Every email is a real email to the real address in the booking; there is no test inbox. Mail goes out through `smtp.gmail.com`, port 587, encrypted with STARTTLS.

1. On the Google account that will **send** the mail, turn on 2-Step Verification and create an App Password at <https://myaccount.google.com/apppasswords>. Gmail refuses your normal password for SMTP. Use a personal Gmail account: school or work accounts often have App Passwords turned off.
2. Create a `.env` file in this folder (`cp .env.example .env`) and set `SMTP_USER` (the Gmail address) and `SMTP_PASS` (the App Password, without the spaces Google shows). `MAIL_FROM` is optional. `.env` is git-ignored: never commit a password.
3. Check the login on its own: `npm run send-test-mail -- someone@gmail.com`. It prints `Connected and logged in.` and sends one test email. `Failed: Invalid login` (535) means the App Password is wrong.
4. Start the service. The log should say `Email goes out through smtp.gmail.com:587, logged in as ...`.

Things to know: Gmail shows the mail as sent from the logged-in account whatever `MAIL_FROM` says, and the first emails may land in Spam. Gmail limits how many messages an account sends per day (roughly 500). Port 587 must be reachable (some networks block 465, which is why we don't use it).

## 1. Messages from Booking

Booking posts a message after its own database commit, and Notification turns it into emails. The service listens on two queues of the exchange `booking.events`; a message that doesn't match its format goes straight to `notification.dlq`.

**`BookingConfirmed`** (queue `notification.booking-confirmed`): the appointment is saved (repeats are ignored), the row is locked, and if its `confirmation_sent_at` tick is empty the confirmation email goes out and the tick is set. The message is acked only after that.

**`SlotsOpened`** (queue `notification.slots-opened`): the people in `slot_subscriptions` for that exact country and visa type each get one email listing the new times. Nobody else is emailed, even if they booked that country before; if nobody subscribed, nobody is. Nobody gets more than one such email for the same country and visa type within `SLOT_ALERT_COOLDOWN_HOURS` (default 24, `0` turns the limit off). The table `slot_alerts` records who was told, so the same message arriving twice sends nothing the second time. If some emails fail, the others still go out and only the people not yet told get one on the retry. `SITE_URL`, if set, is shown at the end of the email.

**When sending fails**, the message moves to a retry queue and returns after 5 s, then 30 s, then 2 min, then goes to `notification.dlq`. The copy is stored in RabbitMQ before the original is acked, so it can't be lost in between.

### Try it without Booking

The fake publisher sends the messages exactly as Booking does (run `npm install` once). **Every email is real, so always pass `--email` with a real address**; the publisher refuses to run without it.

```bash
npm run publish-test-event -- --email you@gmail.com                # a booking for tomorrow
npm run publish-test-event -- --email you@gmail.com --duplicate    # same message twice: one email
npm run publish-test-event -- --invalid                            # broken message: goes to notification.dlq
curl -X PUT localhost:4003/subscriptions/UK/Business -H "Authorization: Bearer $TOKEN"   # subscribe first (see below)
npm run publish-test-event -- --slots-opened --country UK --visa-type Business           # you are told
```

A booking for tomorrow also gets its reminder on the next timer run once it is past 9:00 Irish time. A second slots-opened message right away does nothing, on purpose (the limit above); to test repeatedly, start with `SLOT_ALERT_COOLDOWN_HOURS=0 docker compose up -d`. If the database still holds old made-up test addresses, `docker compose down -v` starts it empty.

## 2. Subscriptions: who gets "new appointments are open"

A user chooses a country and a visa type, and from then on is told when appointments open for exactly that choice. They can choose several. The website would show a "notify me when slots open for this choice" checkbox next to the country and visa dropdowns.

Send the login token from Auth as `Authorization: Bearer <token>`. Whose choices they are comes from the token, so everybody only sees and changes their own.

| Method | Path | What it does |
|---|---|---|
| GET | `/subscriptions` | My choices: `{ data: [{ country, visaType, createdAt }] }` |
| PUT | `/subscriptions/:country/:visaType` | Subscribe. Repeating it is harmless. `{ subscription }` |
| DELETE | `/subscriptions/:country/:visaType` | Unsubscribe. `204`, also when there was nothing to remove |

`:country` is `Schengen`, `UK` or `Irish`; `:visaType` is `Student`, `Business` or `Tourist` (anything else is a `400`). Errors look like `{ "error": { "code": "...", "message": "..." } }`; a missing or bad token is a `401`.

```bash
TOKEN=$(curl -s -X POST localhost:4000/login -H 'Content-Type: application/json' \
        -d '{"email":"you@example.com","password":"..."}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -X PUT    localhost:4003/subscriptions/Schengen/Tourist -H "Authorization: Bearer $TOKEN"
curl           localhost:4003/subscriptions                   -H "Authorization: Bearer $TOKEN"
curl -X DELETE localhost:4003/subscriptions/Schengen/Tourist  -H "Authorization: Bearer $TOKEN"
```

The tokens are checked with Auth's public key, `backend/auth-service/keys/public.pem` (Auth creates it on its first start). The compose file mounts that folder read-only and `JWT_PUBLIC_KEY_PATH` points at it. If the key is missing the routes answer `503`, and emails and reminders keep working. `CORS_ORIGINS` (default `http://localhost:3000`) lists the websites that may call these routes from a browser.

## 3. Reminders

The timer runs every 15 minutes on the Dublin clock and once at startup. A reminder is due once it is 9:00 Irish time on the day before the appointment. If that was missed (for example, the service was off), it is still sent on the day, until the appointment starts. Rows are claimed with `SELECT ... FOR UPDATE SKIP LOCKED`, so two copies of the service never send the same reminder. Ireland moves its clocks on 25 October 2026, so everything uses `Europe/Dublin` and 9 am stays 9 am (see [test/time.test.js](test/time.test.js)).

## Design choices

- **At least once, not at most once.** We send the email first and set the "sent" tick after. If we crash in between, the email is sent again. The other order (tick first) would lose the email instead. The Message-ID is built from the appointment id, so a repeat is recognisable.
- **Repeats are harmless.** The appointment id is the primary key of `notifications`, and `slot_alerts` has one row per message and person.
- **Notification can be down.** Messages wait in the durable queue. On restart it sends every confirmation it missed, and the startup run of the timer sends any reminder that fell due.
- **RabbitMQ can be down.** The service starts anyway and keeps reconnecting (amqplib recovery). `/health` reports `rabbitmq: down` until it is back.
- **Notification has routes**, unlike what the project plan first said, because the choice of what to be told about is notification data and belongs here. The website calls them directly.

## Metrics

| Metric | Meaning |
|---|---|
| `notification_messages_consumed_total{result,stream}` | `stream` is `booking-confirmed` or `slots-opened`. `result` is `sent`, `duplicate`, `retry`, `dead_letter`, or `skipped` (slots-opened only: nobody to tell, or everybody was told recently) |
| `notification_emails_sent_total{kind}` / `notification_emails_failed_total{kind}` | `confirmation`, `reminder` or `slots-opened` |
| `notification_confirmation_delay_seconds` | Time from booking confirmed to email sent |
| `notification_reminder_job_last_run_timestamp_seconds` | When the reminder timer last finished |

## Tests

`npm test` runs the unit tests: the two message formats and queue names, the wording of the emails, the mail settings, who may call the subscription routes, and reminder timing across the clock change.

Checked by hand against the Docker setup (the first four with a local test inbox that has since been removed, the rest through Gmail): repeated messages send one email; a broken message goes to `notification.dlq`; a stopped Notification or mail server delays emails but loses none (retries at 5 s and 30 s); three copies of the reminder timer never double-send; a slot alert goes only to the subscriber of that exact country and visa type, and to nobody after they unsubscribe; subscribing or deleting twice is harmless.
