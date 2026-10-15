# Auth Service

Signup, login and roles (`user`, `admin`) for Book My Visa. After login it hands out a signed JWT (RS256) that the other services verify locally. It also keeps the audit log shown on the admins' **Logs** page.

Stack: Node 22, Express 5, Sequelize 6, PostgreSQL.

## Run it (local only)

```bash
cd backend/auth-service
npm install
cp .env.example .env
npm run dev            # runs the schema scripts + admin seed, then http://localhost:4000
```

If local Postgres already uses port `5432`, Docker uses host port `5433`; set `DATABASE_URL` in `.env` to `postgres://auth:auth@127.0.0.1:5433/auth_db`.

It needs a Postgres database at `DATABASE_URL` (default `postgres://auth:auth@localhost:5432/auth_db`). No local Postgres? `docker compose up -d postgres` starts one, or `docker compose up --build` runs the whole service. The JWT key pair is created in `keys/` on first start.

## The auth database

The auth service has its own database, `auth_db`, with two tables: `users` and `audit_logs`. Open it in any **PostgreSQL** GUI client (pgAdmin, DBeaver, TablePlus, DataGrip):

| Host | Port | Database | User | Password |
|---|---|---|---|---|
| `localhost` | `5432` | `auth_db` | `auth` | `auth` |

(MySQL Workbench and SQL Server Management Studio only talk to their own databases, so they can't open it.)

The schema lives in sequelize-cli scripts under [`db/migrations/`](db/migrations). The app never changes tables itself.

| Command | What it does |
|---|---|
| `npm run db:migrate` | apply new schema scripts |
| `npm run db:migrate:undo` | roll back the last one |
| `npm run db:seed` | add the team's admins (safe to repeat) |

To change the schema, add a new migration file (`npx sequelize-cli migration:generate --name add-something`), update the model in `src/db.js` to match, and commit both. Never edit a migration that teammates have already run.

## Admins

The API never creates admins. Every admin is listed in [`db/seeders/20261009000001-admins.js`](db/seeders/20261009000001-admins.js), so **every clone of the repo gets the same admins**:

| Email | Password |
|---|---|
| `admin@example.com` | `Password123` |

**To add an admin:** add a line to `ADMINS` in that file (with the next id), commit and push. Teammates get it on their next `npm run dev` (or `npm run db:seed`). Existing accounts are skipped, never overwritten.

An admin you add only in your own GUI client (or promote with `UPDATE users SET role = 'admin' ...`) exists only on your laptop. Once logged in, any admin can promote or demote other users with `PATCH /admin/users/:id/role`; that change is local too.

These passwords are in git. That's fine for a local demo, but never reuse a real password.

## API

Send the token as `Authorization: Bearer <token>`. 🔒 = needs a token, 👑 = admin only.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/health` | | `{ status: "ok" }` or 503 |
| POST | `/signup` | `{ email, password, fullName }` | 201 `{ user, accessToken }` |
| POST | `/login` | `{ email, password }` | `{ user, accessToken }` |
| POST | `/logout` 🔒 | | 204 |
| GET | `/me` 🔒 | | `{ user }` |
| PUT | `/me` 🔒 | `{ mobile, nationality }` (both required) | `{ user }` |
| GET | `/admin/users` 👑 | `?role=user\|admin&page=1&limit=20` | `{ data, page, limit, total }` |
| PATCH | `/admin/users/:id/status` 👑 | `{ isActive }` | `{ user }` |
| PATCH | `/admin/users/:id/role` 👑 | `{ role: "user" \| "admin" }` | `{ user }` |
| GET | `/admin/logs` 👑 | `?page=1&limit=20` | `{ data, page, limit, total }` (newest first) |

- Passwords: at least 8 characters, with a letter and a digit.
- Admins can't change their own status or role. A role change, disabling an account and logging out all invalidate that user's existing tokens at this service.
- Login is limited to 5 failed attempts per IP + email every 15 minutes; signup to 20 per IP per hour.
- Logged actions: `USER_SIGNUP`, `ADMIN_LOGIN`, `USER_DISABLED`, `USER_ENABLED`, `USER_ROLE_CHANGED`.
- Every error looks like `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`. Codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` / `INVALID_CREDENTIALS` 401, `FORBIDDEN` / `ACCOUNT_DISABLED` 403, `NOT_FOUND` 404, `EMAIL_TAKEN` 409, `RATE_LIMITED` 429.

There are no refresh tokens: a token lasts `ACCESS_TOKEN_TTL` (default 1 day), then the user logs in again.

## For the other services

Copy [`shared/verifyJwt.middleware.js`](shared/verifyJwt.middleware.js) and point `JWT_PUBLIC_KEY_PATH` at this service's `keys/public.pem`. It gives you `req.user = { id, email, name, role }` without calling the auth service:

```js
router.post('/admin/slots', authenticate, requireAdmin, handler);
```

Because they check tokens locally, a logged-out or disabled user's token keeps working there until it expires.

## Environment variables

| Name | Default |
|---|---|
| `PORT` | `4000` |
| `DATABASE_URL` | `postgres://auth:auth@localhost:5432/auth_db` |
| `CORS_ORIGINS` | `http://localhost:3000` (comma-separated) |
| `ACCESS_TOKEN_TTL` | `1d` |
| `BCRYPT_COST` | `12` |

## Code

```
db/
  migrations/ schema scripts (sequelize-cli)
  seeders/    the team's admin accounts
src/
  server.js   Express app, error handler, start-up
  routes.js   every endpoint and its input checks
  auth.js     JWT signing, authenticate, requireAdmin
  db.js       models for users and audit_logs (must match db/migrations)
  config.js   settings and JWT keys
shared/verifyJwt.middleware.js   for the other services
```
