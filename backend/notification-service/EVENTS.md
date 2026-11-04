# What Notification needs from Booking

Notification sends the confirmation and reminder emails, and the "new appointments are open" email. It never calls Booking and never reads Booking's database. It only reads two messages from RabbitMQ: `BookingConfirmed` (below) and `SlotsOpened` (further down). This page is the agreement on those messages.

## Status

Booking now publishes both messages, from [`backend/booking-service/src/events.js`](../booking-service/src/events.js):

| Booking endpoint | Message | Email |
|---|---|---|
| `POST /api/v1/bookings` | `BookingConfirmed` | the confirmation to that user, then the reminder the day before |
| `POST /api/v1/tpv/slots` (admin) | `SlotsOpened`, one per slot, so `slotTimes` has one entry | "new appointments are open" to the people who **subscribed** to that country and visa type in Notification (see its [README](README.md#subscriptions-who-gets-new-appointments-open-emails)) |

Booking posts **after** its own database commit and doesn't wait for the email: if RabbitMQ is down the booking or slot is still saved and the user still gets their answer, but that one message is not sent (Booking logs it). The outbox below would make delivery guaranteed; it is not built yet. Because each slot is its own message, adding several slots in a row emails each person only once (the one-per-day limit below); set `SLOT_ALERT_COOLDOWN_HOURS=0` to email for every slot.

## Where to publish

| | |
|---|---|
| Exchange | `booking.events` (type `topic`, durable) |
| Routing key | `booking.confirmed` |
| Message properties | `persistent: true`, `contentType: 'application/json'`, `messageId: <eventId>` |

Notification creates the exchange too, so it doesn't matter which service starts first. Use a confirm channel and wait for the confirm before you mark the message as sent.

**Connecting to RabbitMQ.** RabbitMQ is started by this folder's `docker-compose.yml`. Until we have one shared compose file, the Booking container can't reach it by the name `rabbitmq` (each compose file has its own network), so set `RABBITMQ_URL=amqp://guest:guest@host.docker.internal:5672` in Booking. When running Booking outside Docker, use `amqp://guest:guest@localhost:5672`.

## The message

```json
{
  "eventId": "6f1c1d2e-8a4b-4c3d-9e5f-1a2b3c4d5e6f",
  "type": "BookingConfirmed",
  "version": 1,
  "occurredAt": "2026-10-21T10:15:00.000Z",
  "appointmentId": "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
  "userId": "00000000-0000-4000-8000-000000000001",
  "userEmail": "student@example.com",
  "userName": "Student",
  "country": "Schengen",
  "visaType": "Student",
  "day": "2026-10-28",
  "slotTime": "09:00 - 10:00"
}
```

| Field | Where Booking gets it |
|---|---|
| `eventId` | A new UUID for each message |
| `occurredAt` | The time the booking was confirmed (ISO 8601) |
| `appointmentId` | `appointments.appointment_id`. **Notification uses this to avoid sending an email twice**, so it must be the same if the message is ever sent again. |
| `userId`, `userEmail`, `userName` | `req.user.id`, `req.user.email`, `req.user.name` from the JWT. `userName` is optional. |
| `country`, `visaType`, `day`, `slotTime` | The booked slot. `day` is `YYYY-MM-DD`, `slotTime` is `HH:MM - HH:MM` in Irish time. |

A message that doesn't match this exactly goes to the dead letter queue `notification.dlq` and gets no email. The full check is `bookingConfirmed` in [`src/consumer/messages.js`](src/consumer/messages.js).

## Sending it safely: use an outbox

If Booking saves the appointment and then publishes, a crash between the two leaves a booked slot with no email. To avoid that:

1. In the same database transaction that creates the appointment, insert the message into an `outbox` table (`id`, `payload`, `created_at`, `published_at`).
2. A small loop every few seconds reads rows with `published_at IS NULL`, publishes them, waits for RabbitMQ's confirm, then sets `published_at`.

A crash in step 2 means a message can be sent twice. That's fine: Notification sends one email per `appointmentId`.

## The second message: `SlotsOpened`

When an admin adds new slots, Booking posts one `SlotsOpened` message, and Notification emails the people who might want one: "New Schengen Tourist visa appointments are open".

| | |
|---|---|
| Exchange | `booking.events` (same as above) |
| Routing key | `booking.slots-opened` |
| Message properties | `persistent: true`, `contentType: 'application/json'`, `messageId: <eventId>` |

```json
{
  "eventId": "7a0d3c1e-2b4f-4a6d-8e9c-5f1a2b3c4d5e",
  "type": "SlotsOpened",
  "version": 1,
  "occurredAt": "2026-11-04T10:15:00.000Z",
  "country": "Schengen",
  "visaType": "Tourist",
  "day": "2026-11-10",
  "slotTimes": ["09:00 - 10:00", "12:00 - 13:00", "16:00 - 17:00"]
}
```

| Field | Where Booking gets it |
|---|---|
| `eventId` | A new UUID for each message. **Notification uses this to avoid emailing anyone twice for the same message**, so if Booking ever sends a message again, it must keep the same `eventId`. |
| `occurredAt` | The time the slots were added (ISO 8601) |
| `country`, `visaType`, `day` | What the admin picked in `POST /admin/slots` |
| `slotTimes` | The times that were **actually created**, `HH:MM - HH:MM` in Irish time, 1 to 24 of them. Slots that already existed are left out. If nothing new was created, don't send a message. |

Send one message per country, visa type and day (the same shape as the admin's "add slots" form). No list of recipients is needed: **Notification decides who gets the email.** It tells the people who subscribed to that country and visa type through its own `/subscriptions` routes, and nobody else. Notification has no list of all users (Auth owns that), so "who wants to know" is what each person chose.

To keep from flooding anyone, a person gets at most one such email per country and visa type per day (`SLOT_ALERT_COOLDOWN_HOURS`, see the [README](README.md)). Several messages in one day are fine; later ones simply send nothing to people who were already told.

A message that doesn't match this exactly goes to the dead letter queue `notification.dlq` and gets no email. The full check is `slotsOpened` in [`src/consumer/messages.js`](src/consumer/messages.js). The advice above about confirm channels and sending safely applies here too, and a message sent twice is harmless.

## Trying it without Booking

`npm run publish-test-event` in this folder publishes messages exactly like the ones above (see the [README](README.md)). Add `--slots-opened` for the second message.
