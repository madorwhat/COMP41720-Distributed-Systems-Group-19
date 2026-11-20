# Book My Visa

A visa appointment booking app built as microservices.

| Part | Folder | What it does |
|---|---|---|
| Frontend | [`frontend/`](frontend) | React (Vite) website |
| Auth Service | [`backend/auth-service/`](backend/auth-service) | Signup, login, roles; issues JWTs (RS256) and keeps the audit log |
| Booking Service | [`backend/booking-service/`](backend/booking-service) | TPV slots and appointments |
| Notification Service | [`backend/notification-service/`](backend/notification-service) | Confirmation, reminder and "new slots open" emails via Gmail |
| AI Service | [`backend/ai-service/`](backend/ai-service) | AI slot-release planner for admins, using a local Ollama model |
| Monitoring | [`monitoring/`](monitoring) | Prometheus + Grafana |

Each service has its own PostgreSQL database. Booking tells Notification about bookings and new slots through RabbitMQ. Booking and Notification check login tokens locally with Auth's public key (`backend/auth-service/keys/public.pem`, created by Auth on its first start).

## Setup

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Compose v2).

**1. Create the backend settings file.** All three backend services share one file, `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Every setting has a working default except the Gmail login. The Notification service sends real email through Gmail and will not start without it, so edit `backend/.env` and set:

- `SMTP_USER`: the Gmail address that sends the mail.
- `SMTP_PASS`: a Gmail **App Password**, not your normal password. On that Google account, turn on 2-Step Verification, then create one at <https://myaccount.google.com/apppasswords>. Remove the spaces Google shows. Use a personal Gmail account: school or work accounts often have App Passwords turned off.

`.env` is git-ignored. Never commit a password.

**2. Start everything** from the repo root:

```bash
docker compose up --build
```

The first start takes a few minutes, and also downloads the AI model (about 2 GB, only once). Services start in order: the databases and RabbitMQ first, then Auth (which creates the token keys), then Booking, Notification and the AI service, then the frontend.

**3. Open the app** at http://localhost:3000 and log in as the seeded admin:

| Email | Password |
|---|---|
| `admin@example.com` | `Password123` |

### Demo data

Every start also loads demo data, so the app isn't empty:

- **100 users**, `user001@bookmyvisa.test` … `user100@bookmyvisa.test`, all with password `Password123`
- **About 230 slots** on weekdays from 23 Nov 2026, of which 125 are booked by those users
- **155 "tell me when slots open" subscriptions**, deliberately uneven, so the AI planner has real gaps to find (e.g. UK Business: 40 waiting, 0 free)

It lives in the database volumes, so it survives `docker compose down` and rebuilds. Loading it again changes nothing, because existing rows are skipped. The seeders are in each service's `db/seeders/`.

The `.test` addresses can't exist, and Notification never emails them, so the demo never sends mail to fake people.

### Stopping

```bash
docker compose down       # stop, keep the data
docker compose down -v    # stop and delete all databases (fresh start)
```

## What runs where

| What | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Auth Service | http://localhost:4000 |
| Booking Service | http://localhost:4001 |
| Notification Service | http://localhost:4003 |
| AI Service | http://localhost:4004 |
| RabbitMQ UI | http://localhost:15672 (`guest` / `guest`) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (`admin` / `admin`). Dashboard: http://localhost:3001/d/adzqv9t/bookmyvisa-dashboard |

Every service has `GET /health` and `GET /metrics`.

The Grafana dashboard is the file [`monitoring/dashboard.json`](monitoring/dashboard.json). Changes made in the Grafana UI are lost on restart, so edit that file instead (or export from Grafana and paste it in).

### Databases

Open them in any PostgreSQL client (pgAdmin, DBeaver, TablePlus, DataGrip):

| Database | Host | Port | User / password |
|---|---|---|---|
| `auth_db` | `localhost` | `5432` | `auth` / `auth` |
| `booking_db` | `localhost` | `5434` | `booking` / `booking` |
| `notification_db` | `localhost` | `5435` | `notification` / `notification` |

Already running Postgres on 5432? Start with `AUTH_DB_HOST_PORT=5433 docker compose up --build` (or another free port). `BOOKING_DB_HOST_PORT` and `NOTIFICATION_DB_HOST_PORT` work the same way.

Each schema lives in sequelize-cli migrations under the service's `db/migrations/` and runs automatically on start. To change a schema, add a new migration (`npx sequelize-cli migration:generate --name add-something`) and update the model to match. Never edit a migration teammates have already run.

### Adding admins

The API never creates admins. They are listed in [`backend/auth-service/db/seeders/20261009000001-admins.js`](backend/auth-service/db/seeders/20261009000001-admins.js), so every clone gets the same ones. To add one, add a line to `ADMINS`, commit, and restart. Once logged in, an admin can promote other users with `PATCH /admin/users/:id/role`.

## API

Send tokens as `Authorization: Bearer <accessToken>`. 🔒 = login needed, 👑 = admin only. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

Countries: `Schengen`, `UK`, `Irish`. Visa types: `Student`, `Business`, `Tourist`.

**Auth** (`:4000`)

| Method | Path | Body / query |
|---|---|---|
| POST | `/signup` | `{ email, password, fullName }` |
| POST | `/login` | `{ email, password }` → `{ user, accessToken }` |
| POST | `/logout` 🔒 | |
| GET / PUT | `/me` 🔒 | PUT: `{ mobile, nationality }` |
| GET | `/admin/users` 👑 | `?role=user\|admin&page=1&limit=20` |
| PATCH | `/admin/users/:id/status` 👑 | `{ isActive }` |
| PATCH | `/admin/users/:id/role` 👑 | `{ role }` |
| GET | `/admin/logs` 👑 | `?page=1&limit=20` |

**Booking** (`:4001`)

| Method | Path | Body / query |
|---|---|---|
| POST | `/api/v1/tpv/slots` 👑 | `{ country, visaType, day, slotTime }` (time as `HH:MM - HH:MM`) |
| GET | `/api/v1/tpv/slots` | optional `country`, `visaType`, `day` |
| POST | `/api/v1/bookings` 🔒 | `{ bookingId }` |
| GET | `/api/v1/bookings/my-slots` 🔒 | |

**Notification** (`:4003`): "tell me when slots open" subscriptions

| Method | Path |
|---|---|
| GET | `/subscriptions` 🔒 |
| PUT | `/subscriptions/:country/:visaType` 🔒 |
| DELETE | `/subscriptions/:country/:visaType` 🔒 |

**Used by the AI planner** (👑)

| Service | Method | Path | What |
|---|---|---|---|
| AI | POST | `/plans` | Make a plan (AI, or rule-based if the model is unavailable) |
| AI | POST | `/plans/:planId/approve` | `{ items: [{ country, visaType, slots }] }`. Creates the slots in Booking |
| Booking | GET | `/api/v1/tpv/stats` | Free / booked slots per country and visa type, from today on |
| Booking | POST | `/api/v1/tpv/slots/batch` | `{ planId, slots: [...] }`. The same `planId` twice creates nothing |
| Notification | GET | `/subscriptions/stats` | People waiting per country and visa type |

The RabbitMQ messages between Booking and Notification are described in [`backend/notification-service/EVENTS.md`](backend/notification-service/EVENTS.md).

### Postman

Import [`book-my-visa.postman_collection.json`](book-my-visa.postman_collection.json). It has every route, grouped by service, in an order that runs as one flow:

1. **Auth Service**: sign up and log in a test user, update the profile, then log in as the admin and use the admin routes.
2. **Notification Service**: the test user subscribes to Schengen / Student slot alerts.
3. **Booking Service**: the admin creates a slot (subscriber gets an email), the test user books it (confirmation email).
4. **Cleanup**: unsubscribe and log out.
5. **AI Service**: health, and ask for a plan. Approving is left out because it creates real slots; do that from the admin panel.

Before running, set the collection variable `testEmail` to an inbox you own, because the flow sends real email to it. Then run the whole collection with the Runner. Tokens and ids are saved between requests automatically.

## AI slot-release planner

Admins see an **AI release planner** card in the admin panel. **Suggest release plan** works like this:

1. **Snapshot.** The AI service reads how many people are waiting (Notification) and how many slots are free (Booking) for every country and visa type. If either service is down it refuses, because a plan without demand data would be a guess.
2. **Propose.** A small local model (`qwen2.5:3b`, through Ollama) suggests how many slots to add, and why.
3. **Check.** The answer is never trusted:
   - only real countries and visa types, 1–40 slots each
   - only where free slots don't already cover the people waiting
   - every number in the "why" must be in the data, otherwise it is replaced with a sentence built from the real figures
   - gaps the model left out are added to the plan anyway, with the rule-based count

   These corrections aren't shown to the admin (they would look like errors). They are in the API response (`reasonCorrected`, `addedByCheck`, `droppedItems`) and in Grafana.
4. **Approve.** The admin can change or zero each count. Booking is read again (the snapshot may be old), the slots go on the next free weekdays, and Booking creates them in one batch. Subscribers are told as usual.

**If the model is slow or down**, the admin gets a rule-based plan instead (one slot per waiting person without a free one), clearly labelled. There's a 30 s timeout, and after 3 failures in a row the model isn't called for 30 s. Booking never depends on the AI service.

Every plan records the model, the prompt version (`planner-v2`) and when its data was read. Grafana's **AI Planner** row shows model response time, tokens, plans by AI vs rules, fallbacks, and invented numbers caught.

**Why `qwen2.5:3b`?** We compared three sizes on the demo data (same data, 3 runs each, Apple M5, Ollama in Docker on the CPU):

| Model | Size | Time (warm) | Quality |
|---|---|---|---|
| `qwen2.5:1.5b` | 1 GB | ~3.5 s | Missed the biggest shortage (UK Business), suggested slots that weren't needed, wrong figures in its reasons |
| **`qwen2.5:3b`** | 2 GB | ~5 s | Found every shortage, correct reasons, nothing to correct |
| `qwen2.5:7b` | 4.7 GB | — | Didn't fit in Docker's 7.7 GB of memory next to the rest of the app |

The first plan after a start takes ~12 s while the model loads.

To try another model, change `qwen2.5:3b` in both places in `docker-compose.yml` (`ollama-pull` and `OLLAMA_MODEL`). Ollama in Docker runs on the CPU. For more speed on a Mac, install Ollama natively and set `OLLAMA_URL: http://host.docker.internal:11434`.

## How emails work

- **Booking confirmed** → confirmation email right away.
- **Reminder** → 9 am Irish time the day before the appointment.
- **Admin adds a slot** → email to users subscribed to that country and visa type, at most once per `SLOT_ALERT_COOLDOWN_HOURS` (default 24; set `0` in `backend/.env` when testing).

Booking never waits for email: if RabbitMQ or Notification is down, bookings still save and the emails go out once it's back. Failed sends retry after 5 s, 30 s and 2 min, then go to the `notification.dlq` queue. First emails may land in Spam.

## Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | Stop whatever uses that port, or change the left-hand number in `docker-compose.yml` |
| `env file backend/.env not found` | Run `cp backend/.env.example backend/.env` |
| Notification exits at startup | `SMTP_USER` / `SMTP_PASS` missing in `backend/.env` |
| `Invalid login` (535) from Gmail | The App Password is wrong; create a new one |
| Planner always says "Rule-based plan" | The model is still downloading (`docker compose logs ollama-pull`) or Ollama is down. `http://localhost:4004/health` shows which |
| Want a clean slate | `docker compose down -v`, then `docker compose up --build`. Demo data is loaded again; the AI model is downloaded again |

## Running one service outside Docker

Useful while developing a single service. Keep the rest running in Docker, stop that one container (e.g. `docker compose stop booking-service`), then:

```bash
cd backend/booking-service     # or auth-service / notification-service / ai-service
npm install
npm run dev
```

It reads the same `backend/.env`, and its defaults already point at the Docker databases and RabbitMQ on `localhost`.

For the frontend: `cd frontend && npm install && npm run dev`. Notification's unit tests: `cd backend/notification-service && npm test`.
