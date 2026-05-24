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

**Production URL:** [https://allo-inventory-takehome.vercel.app](https://allo-inventory-takehome.vercel.app)

Seed data is pre-loaded with 4 products across 3 warehouses (Chennai, Mumbai, Delhi) with deliberately scarce stock in some locations to demonstrate the 409 Out of Stock and 410 Expired states immediately.

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

## Data Model

```text
+-------------+        +------------------+        +---------------+
|   Product   |        |   StockLevel     |        |   Warehouse   |
+-------------+        +------------------+        +---------------+
| id          |--+  +--| productId (PK)   |--+  +--| id            |
| name        |  |  |  | warehouseId (PK) |  |  |  | name          |
| sku         |  |  |  | totalPhysical    |  |  |  | location      |
+-------------+  |  |  | reservedUnits    |  |  |  +---------------+
                 |  |  +------------------+  |  |
                 |  +------------------------+  +--+
                 |                                 |
                 +---------------------------------+
                 |          Reservation            |
                 +---------------------------------+
                 | id          | productId         |
                 | quantity    | status            |
                 | expiresAt   | warehouseId       |
                 +---------------------------------+
```

**Key design decisions:**
- `StockLevel` uses a composite PK `(productId, warehouseId)` — one row per product-warehouse pair
- `availableUnits` is never stored — always derived as `totalPhysicalUnits - reservedUnits` to avoid sync bugs under concurrent writes
- `Reservation` is indexed on `[status, expiresAt]` for fast cleanup queries

---

## Architecture & Engineering Decisions

### 1. Concurrency Control — Atomic UPDATE Guard

The core challenge: prevent two simultaneous requests from both succeeding on the last unit of a SKU.

**Rejected approaches:**
- `SELECT ... FOR UPDATE` (pessimistic lock) — blocks rows, deadlock risk, poor performance under load
- Optimistic concurrency with version columns — requires retry logic, can thrash under extreme contention

**Chosen approach — Single atomic SQL:**
```sql
UPDATE "StockLevel"
SET "reservedUnits" = "reservedUnits" + quantity
WHERE "productId"   = $1
AND   "warehouseId" = $2
AND   ("totalPhysicalUnits" - "reservedUnits") >= quantity
```

PostgreSQL evaluates the `WHERE` clause and the `SET` atomically on the same row version. If two concurrent requests race for the last unit, exactly one wins. The other gets 0 rows affected → API returns 409 Conflict. No application-level locking. No retries.

**Research reference:** Verified via Perplexity — comparing SELECT FOR UPDATE vs optimistic concurrency vs atomic UPDATE. The single-statement approach outperforms both alternatives under high concurrency with zero deadlock risk. Same pattern used at Amazon-scale inventory systems.

---

### 2. Idempotency Layer — Stripe-Style Redis Guard (Bonus)

POST `/api/reservations` supports an optional `Idempotency-Key` header. This prevents double-reservations on network retries — if a client sends the same request twice, the second call returns the cached first response without repeating the side effect.

**Three states managed in Redis:**

| State | Redis Value | Behaviour |
|---|---|---|
| New request | Key does not exist | Acquire lock → process → cache result for 24h |
| In-flight | `"PENDING"` | Return 409 — another thread is processing this key |
| Completed | Cached JSON | Replay exact original response + `Idempotent-Replayed: true` header |

**TTLs:**
- PENDING lock: 60 seconds — acts as a dead man's switch if the server crashes mid-request
- Completed cache: 24 hours

**Research reference:** Stripe and Shopify idempotency implementation studied via Perplexity. The 3-state lifecycle with atomic Redis SET is the production standard for payment and reservation APIs.

---

### 3. Reservation Expiry — Dual-Layer Cleanup Engine

Serverless environments (Vercel) cannot maintain long-running processes. Redis keyspace notifications also fail in serverless — the function terminates before the event fires.

**Layer 1 — Lazy Evaluation (Passive, always active)**  
Every `GET /api/products` call runs `releaseExpiredReservations()` before returning data. Any PENDING reservation with `expiresAt < NOW()` is atomically released. Zero additional infrastructure.

**Layer 2 — Cron Endpoint (Active, available on paid Vercel plan)**  
`GET /api/cron/sweep` is a protected endpoint that sweeps all expired reservations. On Vercel Pro this runs every minute via `vercel.json`. On the free Hobby plan, it can be triggered by any external cron service (e.g. cron-job.org) pointing to the endpoint with `Authorization: Bearer CRON_SECRET`.

**Maximum staleness on free plan:** bounded by how often `GET /api/products` is called — in practice, every page load. For a 10-minute reservation window this is well within acceptable limits.

**Research reference:** Compared Cron vs lazy evaluation vs Redis TTL events vs delayed queues (BullMQ, Inngest, SQS) via Perplexity. Redis TTL events are impossible in serverless. Delayed queues require persistent workers. Dual lazy+cron is the correct serverless-native pattern.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List all products with live stock per warehouse. Runs lazy cleanup first. |
| GET | `/api/warehouses` | List all fulfillment centers. |
| GET | `/api/reservations/:id` | Get a single reservation by ID. |
| POST | `/api/reservations` | Atomically reserve units. Returns 409 if insufficient stock. Supports `Idempotency-Key` header. |
| POST | `/api/reservations/:id/confirm` | Confirm reservation — payment succeeded. Returns 410 if expired. |
| POST | `/api/reservations/:id/release` | Release reservation early — user cancelled. |
| GET | `/api/cron/sweep` | Protected sweep endpoint. Requires `Authorization: Bearer CRON_SECRET` header. |

---

## Running Locally

### Prerequisites
- Node.js 18+
- Supabase project (free tier)
- Upstash Redis database (free tier)

### 1. Clone and install
```bash
git clone https://github.com/AKILANSP24/allo-inventory-takehome.git
cd allo-inventory-takehome
npm install
```

### 2. Environment variables
Create a `.env` file in the project root with all of the following keys:

```env
# Supabase — Runtime (PgBouncer pooler, port 6543)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase — Migrations only (direct connection, port 5432)
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

# Upstash Redis REST API
UPSTASH_REDIS_REST_URL="https://[your-db-name].upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token-here"

# Cron endpoint protection — generate with: openssl rand -hex 32
CRON_SECRET="your-random-secret-here"

# Must be set to localhost for local development
# Must be set to your Vercel URL for production
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> **Important:** `NEXT_PUBLIC_APP_URL` must be `http://localhost:3000` when running locally. In Vercel production, set it to `https://allo-inventory-takehome.vercel.app`. The API calls in the frontend use this value to construct fetch URLs.

### 3. Run database migrations
```bash
npx prisma migrate dev
```

### 4. Seed the database
```bash
npx ts-node prisma/seed.ts
```

This creates 3 warehouses, 4 products, 12 stock level entries, and 4 sample reservations (including a deliberately expired PENDING one for testing).

**To reset and re-seed at any time:**
```bash
npx ts-node prisma/seed.ts
```

### 5. Start dev server
```bash
npm run dev
```

Open `http://localhost:3000`

---

## How to Demo the Full Flow

### Test 1 — Basic reserve and confirm
1. Open the app
2. Click **Reserve →** on any warehouse card with available stock > 0
3. Checkout page loads with a live 10-minute countdown timer
4. Click **Confirm Purchase** → green success screen appears
5. Click **Back to Products** — that warehouse's available count drops by 1

### Test 2 — Cancel (early release)
1. Click **Reserve →** on any product
2. On checkout page click **Cancel Reservation**
3. Grey cancelled screen appears
4. Return to products — stock count is unchanged (hold was released)

### Test 3 — Out of Stock (409)
Chennai AirRunner X1 starts with only 1 available unit after seed:
1. Click **Reserve →** on Chennai AirRunner (do not confirm)
2. Go back to products
3. Try **Reserve →** Chennai AirRunner again from the same warehouse
4. Red error banner appears: **Out of Stock (409)**

### Test 4 — Expired Reservation (410)
Open Prisma Studio to find the pre-seeded expired reservation:
```bash
npm run db:studio
```
Go to `http://localhost:5555` → **Reservation** table → find a row where `status = PENDING` and `expiresAt` is in the past → copy its `id`.

Run in PowerShell:
```powershell
Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/api/reservations/PASTE_ID_HERE/confirm" `
  | Select-Object StatusCode, Content
```
Expected response: HTTP `410` with `{"error":"Reservation has expired. Please start a new checkout."}`

### Test 5 — Idempotency (Bonus)
First get real IDs from the API:
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/warehouses" | Select-Object -ExpandProperty Content
Invoke-WebRequest -Uri "http://localhost:3000/api/products" | Select-Object -ExpandProperty Content
```

Then run this **twice** with the exact same `Idempotency-Key`:
```powershell
Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/api/reservations" `
  -Headers @{"Content-Type"="application/json"; "Idempotency-Key"="test-demo-key-001"} `
  -Body '{"productId":"REAL_PRODUCT_ID","warehouseId":"REAL_WAREHOUSE_ID","quantity":1}' `
  | Select-Object StatusCode, Headers, Content
```

- **First call:** Creates reservation, returns `201 Created`
- **Second call:** Returns identical `201` response. Headers include `Idempotent-Replayed: true`. No duplicate reservation is created in the database.

### Test 6 — Lazy Cleanup
1. Run `npm run db:studio` and open `http://localhost:5555`
2. Find a PENDING reservation with an expired `expiresAt`
3. Note the `reservedUnits` value in the StockLevel table for that product/warehouse
4. Open `http://localhost:3000/api/products` in the browser (triggers cleanup)
5. Refresh Prisma Studio — the reservation status is now `RELEASED` and `reservedUnits` has decremented automatically

---

## Trade-offs & What I'd Do Differently

### Trade-offs made

**Atomic UPDATE over SELECT FOR UPDATE**  
Single-statement atomic UPDATE gives better concurrency than pessimistic row locking at the cost of slightly less readable code. Correct choice for this workload.

**Dual lazy+cron cleanup over delayed queues**  
A delayed queue (Inngest, BullMQ, SQS) would give sub-second expiry precision. The current approach has staleness bounded by page load frequency. For a 10-minute reservation window this is entirely acceptable. Chosen because it requires zero additional infrastructure.

**Cron removed from free Vercel plan**  
The active cron sweep requires Vercel Pro (`* * * * *`). On the free Hobby plan, lazy evaluation on `GET /api/products` handles all expiry. In a real deployment, an external cron service (cron-job.org) or Vercel Pro would activate the sweep endpoint.

**No authentication**  
Reservation endpoints are unauthenticated for demo simplicity. In production every reservation would be tied to a verified user session.

**No real-time stock sync**  
The product listing doesn't auto-refresh when another user confirms or releases. A production system would use Supabase Realtime WebSocket to push live stock updates to all connected clients.

**Quantity hardcoded to 1 in UI**  
The API supports arbitrary quantities. The Reserve button always sends `quantity: 1`. A production UI would include a quantity selector.

### What I'd add with more time

- User authentication (NextAuth or Supabase Auth)
- Real-time stock updates via Supabase Realtime
- Quantity selector in checkout flow
- Order history and reservation management page
- Webhook endpoint for payment provider callbacks (Stripe, Razorpay)
- Rate limiting on reservation endpoint (upstash/ratelimit)
- Full test suite — Jest unit tests + Playwright E2E
- Observability — structured logging, cron sweep failure alerts
