# Allo Inventory — Multi-Warehouse Reservation Platform

**Built by:** AKILAN S P  
**Register Number:** 22MIA1191  
**Institution:** VIT Chennai — M.Tech Integrated (5 Years), CSE  

---

## What This Is

Allo Inventory is a full-stack, production-grade inventory reservation system built for the Allo Health take-home engineering exercise.

It solves a real e-commerce race condition: when a customer reaches checkout, payment can take several minutes (3DS, UPI, wallet redirects). During that window, thousands of other shoppers may be viewing the same product page.

- **Decrement at payment time** → overselling. Two customers pay for one unit.
- **Decrement at add-to-cart** → artificial scarcity. 80% cart abandonment kills conversion.
- **Solution** → A 10-minute temporary reservation lock. Payment succeeds = confirm. Payment fails or timer expires = release back to available stock.

---

## Live Demo

**Production URL:** `https://your-vercel-url.vercel.app`

Seed data is pre-loaded with 4 products across 3 warehouses (Chennai, Mumbai, Delhi) with deliberately scarce stock in some locations to demonstrate the 409 and Out of Stock states immediately.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Database | Supabase (PostgreSQL, hosted) |
| ORM | Prisma 6 |
| Cache & Idempotency | Upstash Redis (serverless HTTP) |
| Validation | Zod |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

---

## Architecture & Engineering Decisions

### 1. Concurrency Control — Atomic UPDATE Guard

The core challenge is preventing two simultaneous requests from both succeeding on the last unit of a SKU.

**Rejected approaches:**
- `SELECT ... FOR UPDATE` (pessimistic lock) — blocks rows, poor performance under concurrency, deadlock risk
- Optimistic concurrency with version columns — requires retry logic, can fail under extreme contention

**Chosen approach — Single atomic SQL:**
```sql
UPDATE "StockLevel"
SET "reservedUnits" = "reservedUnits" + quantity
WHERE "productId" = $1
AND "warehouseId" = $2
AND ("totalPhysicalUnits" - "reservedUnits") >= quantity
```

If two concurrent requests arrive for the last unit, PostgreSQL's row-level locking guarantees exactly one UPDATE succeeds. The other gets 0 rows affected → returns 409 Conflict. No application-level locking needed. This is the same pattern used at Amazon scale.

**Research reference:** Atomic UPDATE guard pattern — verified via Perplexity research comparing SELECT FOR UPDATE vs optimistic concurrency vs atomic UPDATE. The single-statement approach outperforms both alternatives under high concurrency with zero deadlock risk.

---

### 2. Idempotency Layer — Stripe-Style Redis Guard (Bonus)

POST requests to `/api/reservations` support an `Idempotency-Key` header. This prevents double-reservations on network retries.

**Three states managed in Redis:**

| State | Redis Value | Response |
|---|---|---|
| New request | Key doesn't exist | Acquire lock → process → cache result |
| In-flight | `"PENDING"` | 409 Conflict — retry after 2s |
| Completed | Cached JSON payload | Replay exact response + `Idempotent-Replayed: true` header |

**TTLs:**
- PENDING lock: 60 seconds (dead man's switch if server crashes mid-request)
- Completed cache: 24 hours

**Research reference:** Stripe and Shopify idempotency implementation — verified via Perplexity. The 3-state lifecycle (null → PENDING → completed JSON) with atomic Redis SET is the production standard.

---

### 3. Reservation Expiry — Dual-Layer Cleanup Engine

Serverless environments (Vercel) cannot maintain long-running processes or WebSocket listeners. Redis keyspace notifications also fail in serverless — functions terminate before events fire.

**Solution: Two complementary layers:**

**Layer 1 — Lazy Evaluation (Passive)**  
Every `GET /api/products` call runs `releaseExpiredReservations()` before returning data. Any past-due PENDING reservations are swept and released atomically. Zero additional infrastructure needed.

**Layer 2 — Vercel Cron Job (Active)**  
`vercel.json` schedules `GET /api/cron/sweep` every minute:
```json
{
  "crons": [{ "path": "/api/cron/sweep", "schedule": "* * * * *" }]
}
```
This endpoint is protected by a `CRON_SECRET` bearer token and releases all expired PENDING reservations, decrementing `reservedUnits` back atomically.

**Maximum staleness:** 60 seconds in production (cron interval).

**Research reference:** Compared Cron jobs vs lazy evaluation vs Redis TTL events vs delayed queues (BullMQ, Inngest, SQS). Redis TTL events are impossible in serverless. Delayed queues require persistent workers. The dual lazy+cron approach is the correct serverless-native pattern — verified via Perplexity.

---

## Data Model
Product ──< StockLevel >── Warehouse
│                           │
└──────< Reservation >──────┘

- **StockLevel** — composite PK `(productId, warehouseId)`. Stores `totalPhysicalUnits` and `reservedUnits`. Available stock is always derived: `total - reserved`. Never stored to avoid 3-way sync problems under concurrent writes.
- **Reservation** — status: `PENDING → CONFIRMED` (payment success) or `PENDING → RELEASED` (cancel/expiry). Indexed on `[status, expiresAt]` for fast cleanup queries.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List products with available stock per warehouse. Runs lazy cleanup first. |
| GET | `/api/warehouses` | List all fulfillment centers. |
| POST | `/api/reservations` | Atomically reserve units. Returns 409 if insufficient stock. Supports `Idempotency-Key`. |
| POST | `/api/reservations/:id/confirm` | Confirm reservation (payment succeeded). Returns 410 if expired. |
| POST | `/api/reservations/:id/release` | Release reservation early (user cancelled). |
| GET | `/api/cron/sweep` | Protected cron endpoint. Sweeps and releases all expired reservations. |

---

## Running Locally

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- An Upstash Redis database (free tier works)

### 1. Clone and install
```bash
git clone https://github.com/AKILANSP24/allo-inventory-takehome.git
cd allo-inventory-takehome
npm install
```

### 2. Set up environment variables
Create a `.env` file in the project root:
```bash
# Supabase — Runtime (PgBouncer, port 6543)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase — Migrations (Direct, port 5432)
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://[your-db].upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token-here"

# Cron protection
CRON_SECRET="your-random-secret"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Run migrations
```bash
npx prisma migrate dev
```

### 4. Seed the database
```bash
npx ts-node prisma/seed.ts
```

To reset and re-seed at any time:
```bash
npx ts-node prisma/seed.ts
```
This deletes all existing data and re-seeds 3 warehouses, 4 products, 12 stock entries, and 4 sample reservations.

### 5. Start the dev server
```bash
npm run dev
```

Open `http://localhost:3000`

---

## How to Demo the Full Flow

### Test 1 — Basic reserve and confirm
1. Open `http://localhost:3000`
2. Click **Reserve →** on any warehouse with available stock > 0
3. Checkout page loads with a live 10-minute countdown timer
4. Click **Confirm Purchase** → green success screen
5. Return to products — that warehouse's available count drops by 1

### Test 2 — Cancel (early release)
1. Click **Reserve →** on any product
2. On checkout page click **Cancel Reservation**
3. Grey cancelled screen appears
4. Return to products — stock count is unchanged (hold released)

### Test 3 — Out of Stock (409)
Chennai AirRunner X1 starts with only 1 available unit:
1. Click **Reserve →** on Chennai AirRunner
2. Go back to products without confirming
3. Try to **Reserve →** Chennai AirRunner again
4. Red error banner: **Out of Stock (409)**

### Test 4 — Expired Reservation (410)
Get a real expired reservation ID from Prisma Studio:
```bash
npm run db:studio
```
Open `http://localhost:5555` → Reservation table → find a row where `status = PENDING` and `expiresAt` is in the past → copy its `id`.

Then run (PowerShell):
```powershell
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/api/reservations/PASTE_ID_HERE/confirm" | Select-Object StatusCode, Content
```
Expected: HTTP 410 with `{"error":"Reservation has expired. Please start a new checkout."}`

### Test 5 — Idempotency (Bonus)
First get real IDs:
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/warehouses" | Select-Object -ExpandProperty Content
Invoke-WebRequest -Uri "http://localhost:3000/api/products" | Select-Object -ExpandProperty Content
```

Run the same request twice with the same `Idempotency-Key`:
```powershell
# Run this twice — same key, same body
Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/api/reservations" `
  -Headers @{"Content-Type"="application/json"; "Idempotency-Key"="test-demo-key-001"} `
  -Body '{"productId":"REAL_PRODUCT_ID","warehouseId":"REAL_WAREHOUSE_ID","quantity":1}' `
  | Select-Object StatusCode, Headers, Content
```

First call: creates reservation, returns 201.  
Second call: returns identical response, headers include `Idempotent-Replayed: true`. No duplicate reservation created in the database.

### Test 6 — Lazy Cleanup
1. Open Prisma Studio (`npm run db:studio`)
2. Find a PENDING reservation with an expired `expiresAt`
3. Note the `reservedUnits` value in StockLevel for that product/warehouse
4. Hit `http://localhost:3000/api/products` in the browser
5. Refresh Prisma Studio — the reservation status changes to `RELEASED` and `reservedUnits` decrements automatically

---

## Trade-offs & What I'd Do Differently

### Trade-offs made

**Atomic UPDATE over SELECT FOR UPDATE**  
Chose the single-statement atomic UPDATE pattern over pessimistic row locking. Gives better concurrency at the cost of slightly less readable code. Correct choice for this use case.

**Dual cleanup over delayed queues**  
A proper delayed queue (Inngest, BullMQ, SQS) would give sub-second expiry precision. The cron+lazy approach has up to 60 seconds of staleness. Acceptable for a 10-minute reservation window — 60 seconds of staleness is less than 1% of the hold duration. Chosen because it requires zero additional infrastructure beyond what was already in the stack.

**No auth layer**  
Reservation endpoints are unauthenticated. In production, every reservation would be tied to a user session and requests would be validated against it.

**No WebSocket / real-time sync**  
The product listing page doesn't auto-refresh when another user confirms or releases a reservation. A production system would use Supabase Realtime or Server-Sent Events to push stock updates to all connected clients.

**quantity hardcoded to 1 in UI**  
The API supports arbitrary quantities. The frontend Reserve button always sends `quantity: 1`. A production UI would have a quantity selector.

### What I'd add with more time

- User authentication (NextAuth or Supabase Auth)
- Real-time stock updates via Supabase Realtime WebSocket
- Quantity selector in the reservation flow
- Order history page
- Webhook support for payment provider callbacks (Stripe, Razorpay)
- Rate limiting on the reservation endpoint
- Full test suite (Jest + Playwright E2E)
- Monitoring and alerting on cron sweep failures