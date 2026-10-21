# Notification Service

Sends the two Book My Visa emails:

- **Confirmation**: as soon as Booking says a booking is confirmed.
- **Reminder**: at 9 am Irish time on the day before the appointment.

It has no business routes. It reads `BookingConfirmed` messages from RabbitMQ, keeps its own `notifications` table, and sends email to [Mailpit](https://mailpit.axllent.org/), a pretend inbox, so no real email is ever sent. What Booking has to publish is in [EVENTS.md](EVENTS.md).

Stack: Node 22, Express 5, Sequelize 6, PostgreSQL, RabbitMQ (amqplib), nodemailer, node-cron, prom-client.

## Run it

```bash
cd backend/notification-service
docker compose up --build
```

| What | Where |
|---|---|
| Notification health and metrics | http://localhost:4003/health, http://localhost:4003/metrics |
| Mailpit inbox | http://localhost:8025 |
| RabbitMQ UI | http://localhost:15672 (`guest` / `guest`) |
| Notification database | `localhost:5435`, database `notification_db`, user and password `notification` |

If a port is taken, set `NOTIFICATION_HOST_PORT`, `NOTIFICATION_DB_HOST_PORT`, `RABBITMQ_HOST_PORT`, `RABBITMQ_UI_HOST_PORT`, `MAILPIT_SMTP_HOST_PORT` or `MAILPIT_UI_HOST_PORT`.

To run the service outside Docker, keep the other containers running, then `npm install`, `cp .env.example .env` and `npm run dev`.

## Try it without Booking

The fake publisher sends messages exactly as Booking will (run `npm install` once first):

```bash
npm run publish-test-event                          # one booking for tomorrow
npm run publish-test-event -- --count 20            # 20 bookings
npm run publish-test-event -- --duplicate           # same message twice: one email
npm run publish-test-event -- --invalid             # broken message: goes to notification.dlq
npm run publish-test-event -- --day 2026-10-30 --time "12:00 - 13:00" --email you@example.com
```

## How it works

**Confirmation email**

1. The message arrives on the queue `notification.booking-confirmed`, bound to the `booking.events` exchange with routing key `booking.confirmed`.
2. It's checked against the schema in [src/events.js](src/events.js). A broken message goes straight to `notification.dlq`.
3. The appointment is saved, and duplicates are ignored (`INSERT ... ON CONFLICT DO NOTHING`).
4. The row is locked. If `confirmation_sent_at` is already set, this is a duplicate and nothing is sent. Otherwise the email goes out, then `confirmation_sent_at` is set.
5. The message is acked only after that. If the service crashes before the ack, RabbitMQ delivers the message again.

**When the email fails**, the message moves to a retry queue and comes back after 5 seconds, then 30 seconds, then 2 minutes. After that it goes to `notification.dlq`. The copy is stored in RabbitMQ before the original is acked, so it can't be lost in between.

**Reminder job**: it runs every 15 minutes on the Dublin clock and once at startup. A reminder is due once it is 9:00 Irish time on the day before. If that was missed (for example, the service was off), it is still sent on the day, until the appointment starts. Rows are claimed with `SELECT ... FOR UPDATE SKIP LOCKED`, so two copies of the service never send the same reminder.

**Why Dublin time**: Ireland moves its clocks on 25 October 2026. The job and the date checks use `Europe/Dublin`, so 9 am stays 9 am. See [test/time.test.js](test/time.test.js).

## Design choices

- **At least once, not at most once.** We send the email first and set the "sent" tick after. If we crash in between, the email is sent again. The other order (tick first) would lose the email instead. The Message-ID is built from the appointment id, so a repeat is recognisable.
- **Duplicates are stopped by the appointment id**, the primary key of `notifications`. This makes repeated messages harmless, which is what Booking's outbox needs.
- **Notification can be down.** Messages wait in the durable queue. On restart it sends every confirmation it missed, and the startup run of the reminder job sends any reminder that fell due.
- **RabbitMQ can be down.** The service starts anyway and keeps reconnecting (amqplib recovery). `/health` reports `rabbitmq: down` until it is back.

## Metrics

| Metric | Meaning |
|---|---|
| `notification_messages_consumed_total{result}` | `sent`, `duplicate`, `retry`, `dead_letter` |
| `notification_emails_sent_total{kind}` / `notification_emails_failed_total{kind}` | `confirmation` or `reminder` |
| `notification_confirmation_delay_seconds` | Time from booking confirmed to email sent |
| `notification_reminder_job_last_run_timestamp_seconds` | When the reminder job last finished |

## Tests

`npm test` runs the unit tests: the event schema, and reminder timing across the clock change.

These were checked by hand against the Docker setup, using the fake publisher and Mailpit:

| Scenario | Result |
|---|---|
| Same message published twice (3 bookings) | 3 emails |
| Broken message | moved to `notification.dlq`, no email |
| Notification stopped, 20 bookings, started again | 20 emails |
| Mailpit stopped, then started | retried at 5 s and 30 s, then one email |
| Three copies of the reminder job started together on 10 due reminders | 3 + 3 + 4 sent, 10 emails |
| `docker compose stop` | clean shutdown, exit code 0 |
