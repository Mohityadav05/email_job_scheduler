# ReachInbox Email Scheduler

A take-home assignment built for ReachInbox. It's a production-style bulk email scheduling service with a Next.js dashboard. I built it to demonstrate the full stack — scheduling, rate limiting, idempotency, restart persistence, and OAuth — without over-engineering any of it.

---

## How to run

### Prerequisites

- Node 20+, npm
- Docker Desktop (for Redis, MySQL, Elasticsearch)
- A Google Cloud project with OAuth 2.0 credentials
- Ethereal SMTP accounts ([create one here](https://ethereal.email/create))

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts Redis on 6379, MySQL on **3307** (host port, container port is still 3306), and Elasticsearch on 9200.

> MySQL uses 3307 on the host to avoid conflicting with any locally installed MySQL.

### 2. Backend setup

```bash
cd backend
cp .env.example .env
# Fill in your values (see below)
npm install
npx prisma db push       # creates the schema
npm run dev              # starts Express on :3001
npm run dev:worker       # starts the BullMQ worker (separate terminal)
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev              # starts Next.js on :3000
```

Open `http://localhost:3000` and sign in with Google.

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string (port 3307 if using Docker) |
| `REDIS_URL` | Redis URL |
| `SMTP_SENDERS` | JSON array of Ethereal accounts (see example) |
| `GOOGLE_CLIENT_ID/SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3001/auth/google/callback` |
| `JWT_SECRET` | Long random string, keep it secret |
| `SLACK_CLIENT_ID/SECRET` | From Slack app settings (optional) |
| `WORKER_CONCURRENCY` | How many jobs run in parallel (default: 5) |
| `MIN_DELAY_MS` | Minimum gap between sends per sender (default: 2000ms) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hourly cap per sender account (default: 50) |

### Ethereal setup

Go to [ethereal.email/create](https://ethereal.email/create), create one or more accounts, and put them in `SMTP_SENDERS` as a JSON array:

```json
[
  {"id":"sender1","user":"you@ethereal.email","pass":"yourpass","host":"smtp.ethereal.email","port":587},
  {"id":"sender2","user":"you2@ethereal.email","pass":"yourpass2","host":"smtp.ethereal.email","port":587}
]
```

After each send, the worker logs a preview URL like `https://ethereal.email/message/...` where you can see the email.

### Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:3001/auth/google/callback` as an authorized redirect URI
4. Copy the client ID and secret into `.env`

---

## Architecture

### Scheduling

`POST /api/emails/schedule` accepts a list of recipient emails plus a `startTime`, `delayBetweenMs`, and `hourlyLimit`. For each lead it creates a DB row with `scheduledAt = startTime + index * delayBetweenMs`, then adds a BullMQ delayed job using the DB row's ID as the `jobId`. BullMQ won't accept a duplicate `jobId`, so re-adding is always safe.

### Restart persistence

On every server and worker boot, `reconcile()` runs. It finds DB rows that are still `scheduled` (or stuck in `sending` for more than 5 minutes) and re-enqueues them with the same `jobId`. Redis AOF persistence means the queue itself survives restarts too.

### Rate limiting

Two separate mechanisms:

**Minimum delay between sends per sender** — A Redis `SET NX PX` lock on `mindelay:{senderId}`. If the lock is held when the worker processes a job, it reads the remaining TTL and calls `job.moveToDelayed(now + remaining)`. The job goes back into the delayed queue; nothing is dropped.

**Hourly cap per sender** — An atomic Lua script on `rate:{senderId}:{hourWindow}` that does `INCR` then checks against the limit. The Lua script is necessary because `INCR` and `EXPIRE` can't be made atomic any other way. If the count exceeds the cap, the job is moved to the start of the next hour window (`msUntilNextHourWindow() + 1000ms` offset to preserve ordering). A Slack notification is sent once per sender per hour window via a separate `SET NX EX` guard key.

### Concurrency

`WORKER_CONCURRENCY` controls how many jobs run simultaneously. BullMQ fetches that many jobs at once; each job then applies its own rate-limit checks. So with concurrency 5 and MIN_DELAY_MS 2000, the effective throughput is at most 5 sends every 2 seconds (though the sender lock serializes sends per-sender, not globally).

### Under 1000+ emails

With 1000 leads, 1000 DB rows are created in a single transaction and 1000 BullMQ delayed jobs are added. They drain at the rate set by concurrency × MIN_DELAY_MS, capped by the hourly limit. No jobs are dropped — they just queue. The Bull Board UI at `/admin/queues` shows the live state.

### Idempotency

The worker claims a row with:

```sql
UPDATE emails SET status = 'sending' WHERE id = ? AND status = 'scheduled'
```

If 0 rows are affected, it returns early. This means even if two worker instances somehow pick up the same job (shouldn't happen with BullMQ's locking, but defence in depth), only one sends the email.

---

## Features mapped to the assignment

| Requirement | Where |
|---|---|
| POST /api/schedule | `backend/src/routes/emails.ts` |
| Round-robin senders | `nextSender()` in emails.ts |
| Worker concurrency from env | `config.WORKER_CONCURRENCY` |
| MIN_DELAY_MS per sender | `acquireMinDelayLock()` in rateLimiter.ts |
| Hourly rate limit with Lua | `checkAndIncrRateLimit()` in rateLimiter.ts |
| Idempotent claim | `UPDATE WHERE status='scheduled'` in worker.ts |
| Reconcile on boot | `reconcile.ts`, called at worker startup |
| Elasticsearch index + search | `lib/elasticsearch.ts`, routes/emails.ts |
| Bull Board | `/admin/queues` via `@bull-board/express` |
| Slack OAuth + notification | `routes/slack.ts`, `lib/slack.ts` |
| Google OAuth + JWT cookie | `routes/auth.ts` |
| Paginated emails list | `GET /api/emails` in routes/emails.ts |
| Next.js dashboard | `frontend/app/dashboard/page.tsx` |
| Compose modal with CSV parse | `frontend/components/ComposeModal.tsx` |
| Loading skeletons, toasts | `Table.tsx`, `Toast.tsx` |
| Reusable component library | `frontend/components/ui/` |
| Typed API client | `frontend/lib/api.ts` |

---

## Assumptions and trade-offs

- **Shadow database**: `prisma db push` is used instead of `prisma migrate dev` because the Docker MySQL user doesn't have `CREATE DATABASE` permission needed for the shadow DB. In production you'd set up migrations properly.

- **Round-robin resets on restart**: The sender index is in-memory. After a restart, the first scheduled batch starts from sender 0 again. This is fine because sender assignment is persisted in the DB — reconciled jobs go to their original sender, not re-assigned.

- **Slack requires `chat:write` user scope**: The OAuth flow requests both the bot scope and the user scope so the notification goes to the user's own DM. This requires the Slack app to have the `chat:write` user scope enabled.

- **Elasticsearch is best-effort**: If ES is down, schedule and send operations still succeed — the ES calls are fire-and-forget with caught errors. The search endpoint will fail if ES is unavailable, which is acceptable.

- **No background job for "sent" emails cleanup**: Sent rows accumulate indefinitely. In production you'd archive old rows to cold storage.

- **MySQL port 3307**: The host port is 3307 to avoid conflicting with locally installed MySQL on 3306. The Prisma connection string uses 3307.
