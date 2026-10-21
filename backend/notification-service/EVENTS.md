# What Notification needs from Booking

Notification sends the confirmation and reminder emails. It never calls Booking and never reads Booking's database. It only reads one message, `BookingConfirmed`, from RabbitMQ. This page is the agreement on that message.

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

A message that doesn't match this exactly goes to the dead letter queue `notification.dlq` and gets no email. The full check is `bookingConfirmed` in [`src/events.js`](src/events.js).

## Sending it safely: use an outbox

If Booking saves the appointment and then publishes, a crash between the two leaves a booked slot with no email. To avoid that:

1. In the same database transaction that creates the appointment, insert the message into an `outbox` table (`id`, `payload`, `created_at`, `published_at`).
2. A small loop every few seconds reads rows with `published_at IS NULL`, publishes them, waits for RabbitMQ's confirm, then sets `published_at`.

A crash in step 2 means a message can be sent twice. That's fine: Notification sends one email per `appointmentId`.

## Trying it without Booking

`npm run publish-test-event` in this folder publishes messages exactly like the ones above (see the [README](README.md)).
