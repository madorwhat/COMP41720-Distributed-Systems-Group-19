# Booking Service & Mock TPV

The Booking Service owns the mock TPV slots and appointments in its own PostgreSQL database. It verifies Auth Service JWTs using the shared public key; no user table is copied into this database.

## Start independently

On a fresh clone, first start Auth and its database from `backend/auth-service`:

```bash
docker compose up --build -d auth-service
docker compose ps
test -s keys/public.pem && echo "Auth public key is ready"
```

Wait for `auth-service` to show `healthy` and the key check to succeed. Then, in a separate terminal, start only Booking and its database from `backend/booking-service`:

```bash
docker compose up --build
```

The Booking Service is at `http://localhost:4001`, and its database is exposed on port `5434`. If those ports are occupied, set `BOOKING_HOST_PORT` or `BOOKING_DB_HOST_PORT` when starting Compose. Auth does not need to be running to start Booking; its public key is mounted for token verification. Auth must be running when users need to log in or update profiles.

Import [`booking-service.postman_collection.json`](../../booking-service.postman_collection.json) into Postman and run the collection in order to exercise the endpoints end to end. It logs in as the seeded admin, creates a one-off test user, updates that user's profile, seeds a future slot, books it, and checks that the booked slot is no longer available. Both Auth and Booking services must be running for the full collection.

## Endpoints

Send authenticated requests with `Authorization: Bearer <accessToken>`.

| Method | Path | Access | Request / response |
|---|---|---|---|
| POST | `/api/v1/tpv/slots` | Admin | `{ country, visaType, day, slotTime }`; returns `{ slot }` |
| GET | `/api/v1/tpv/slots` | Public | Optional `country`, `visaType`, `day` filters; returns `{ data }` with unbooked slots |
| POST | `/api/v1/bookings` | Authenticated | `{ bookingId }`; returns `{ appointment }` |
| GET | `/api/v1/bookings/my-slots` | Authenticated | Returns `{ data }` with the user's appointments and slot details |

Allowed countries are `Schengen`, `UK`, and `Irish`; visa types are `Student`, `Business`, and `Tourist`. A time range uses `HH:MM - HH:MM`.

The database prevents duplicate slots with the same country, visa type, day, and time range. Bookings update the slot and create the appointment in one database transaction. The conditional update and unique appointment constraint prevent the same slot from being booked twice, including concurrent requests.

## Emails (Notification service)

Booking does not send email itself. After its own database commit it posts a message to RabbitMQ, and the [Notification service](../notification-service/README.md) turns it into an email:

| Endpoint | Message posted | Who gets an email |
|---|---|---|
| `POST /api/v1/bookings` | `BookingConfirmed` | The user who booked (from their login token) |
| `POST /api/v1/tpv/slots` (admin) | `SlotsOpened` | The people who subscribed, in Notification, to that country and visa type |

The code is in [`src/events.js`](src/events.js); the messages are described in [Notification's EVENTS.md](../notification-service/EVENTS.md). Booking never waits for the email and never fails because of it: with RabbitMQ down, bookings and slots are still saved and the API answers as usual, and only that email is not sent (Booking logs `Could not send ...`). It reconnects by itself when RabbitMQ is back.

RabbitMQ is started by the Notification Service's compose file. Set `RABBITMQ_URL` (default `amqp://guest:guest@localhost:5672`; in Booking's own compose file `amqp://guest:guest@host.docker.internal:5672`). If port 5672 is already used on your machine, point it at the port Notification's RabbitMQ is published on, for example `RABBITMQ_URL=amqp://guest:guest@host.docker.internal:5673 docker compose up`.
