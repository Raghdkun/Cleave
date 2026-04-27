# Cleave – Production Deployment Guide

Cleave is a website-to-static-export SaaS. The production stack is:

- **Frontend**: React 19 SPA built with Vite (served as static files)
- **Backend**: Node.js 20 Express API (`web/server`)
- **Database**: PostgreSQL 14+
- **Auth**: GitHub OAuth + email/password (bcrypt)
- **Billing**: Stripe Checkout + Customer Portal (subscription)

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | `node -v` |
| npm | 10+ | ships with Node |
| PostgreSQL | 14+ | local or hosted (Neon, Supabase, RDS, …) |
| Stripe account | — | only needed if you want paid plans |
| GitHub OAuth app | — | required for "Sign in with GitHub" |
| (Dev) Stripe CLI | — | `brew install stripe/stripe-cli/stripe` |

---

## 2. Environment variables

All env vars live in `web/.env`. A template is at `web/.env.example`.

```bash
# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/cleave?schema=public"

# GitHub OAuth (https://github.com/settings/developers)
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GITHUB_CALLBACK_URL="https://your-domain.com/api/auth/github/callback"

# Sessions  (generate: openssl rand -hex 32)
SESSION_SECRET="<32-byte hex>"

# Public origin of the frontend (used for OAuth redirect + Stripe success URLs)
WEB_BASE_URL="https://your-domain.com"

# First admin (matches User.login from GitHub). Promoted on first sign-in.
INITIAL_ADMIN_GITHUB_LOGIN="your-github-username"

# Stripe (leave blank to disable billing)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Server
PORT="3001"
NODE_ENV="production"
```

> **Cookies in production**: the session cookie sets `secure: true` automatically when `NODE_ENV=production`. Therefore HTTPS is required in production.

---

## 3. GitHub OAuth setup

1. Visit https://github.com/settings/developers → **New OAuth App**.
2. Homepage URL: `https://your-domain.com`
3. Authorization callback URL: `https://your-domain.com/api/auth/github/callback`
4. Copy the Client ID + Client Secret into `web/.env`.

---

## 4. Stripe setup

### a. Create products + prices

Each plan in the database (`free`, `pro`, `studio`) maps to a Stripe **product** with two **prices** (monthly and yearly).

1. In Stripe dashboard → **Products** → **Add product** for each paid tier (e.g., "Cleave Pro").
2. Add two recurring prices: monthly + yearly.
3. Copy each `price_xxx` ID.
4. In the Cleave admin dashboard (`/dashboard`, accessible to ADMIN role users):
   - Edit the **Pro** plan → paste price IDs into **Stripe price (monthly)** and **Stripe price (yearly)**.
   - Repeat for **Studio**.
   - Save.

The free plan needs no price IDs.

### b. Webhook endpoint

Cleave listens at `POST /api/billing/webhook` (raw body, signed with `STRIPE_WEBHOOK_SECRET`).

**Production** — in Stripe dashboard → Developers → **Webhooks** → Add endpoint:
- URL: `https://your-domain.com/api/billing/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**Development** — run:
```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```
Stripe prints a `whsec_…` secret that you put in `web/.env` for local testing.

### c. Customer Portal

Stripe Dashboard → Settings → **Billing** → **Customer portal**. Enable:
- Cancel subscriptions
- Update payment method
- View invoices
- Switch plans (optional)

The "Manage subscription" button in `/billing` opens this portal.

---

## 5. Database setup

```bash
cd web

# Push the schema
npm run db:push

# Seed the 3 default plans (free / pro / studio)
npm run db:seed
```

> Always use the local Prisma binary: `./node_modules/.bin/prisma` (or the npm script wrappers). Do **not** `npx prisma` — npx may pull a newer major version that drops `url = env(...)` from the datasource block.

For schema migrations after the initial release, prefer `prisma migrate`:
```bash
./node_modules/.bin/prisma migrate dev --name <change>
# in production:
./node_modules/.bin/prisma migrate deploy
```

---

## 6. First admin

1. Set `INITIAL_ADMIN_GITHUB_LOGIN="your-github-username"` in `web/.env`.
2. Sign in with GitHub at `/auth`.
3. On first sign-in the user is promoted to `ADMIN`. The admin dashboard appears at `/dashboard`.

To manually promote an existing user later, update the database:
```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE "login" = 'someone';
```

---

## 7. Build and run

```bash
cd web
npm install --production=false
npm run build           # builds the SPA into web/dist
NODE_ENV=production node --import tsx ./server/index.ts
```

Or use the included scripts (check `web/package.json` for `start` / `dev`).

### Process manager (recommended)

```bash
# pm2
npm install -g pm2
pm2 start "node --import tsx ./server/index.ts" --name cleave \
  --cwd /path/to/web --env production
pm2 save
pm2 startup   # for boot persistence
```

Or systemd:
```ini
[Service]
WorkingDirectory=/srv/cleave/web
EnvironmentFile=/srv/cleave/web/.env
ExecStart=/usr/bin/node --import tsx ./server/index.ts
Restart=always
User=cleave
```

---

## 8. Reverse proxy / TLS

Cleave's Express server listens on `PORT` (default 3001). Put it behind nginx/Caddy with HTTPS.

**Caddyfile**:
```
your-domain.com {
    reverse_proxy localhost:3001
}
```

**nginx**:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 5m;

    # Stripe webhook needs the raw body — DO NOT modify the body.
    location /api/billing/webhook {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;   # required for SSE /api/export/:id/progress
        proxy_read_timeout 1h;
    }
}
```

The server has `app.set('trust proxy', 1)` so `X-Forwarded-*` headers are honored for rate limiting and secure cookies.

---

## 9. Security checklist

- [ ] HTTPS enforced (redirect 80 → 443)
- [ ] `SESSION_SECRET` is unique & random (32+ bytes hex)
- [ ] `NODE_ENV=production` (enables `secure` cookies)
- [ ] GitHub OAuth secret rotated (the dev secret in this repo is **compromised** and must be regenerated before launch)
- [ ] Stripe is in **live** mode with live keys
- [ ] Webhook signing secret correctly set
- [ ] Database backups configured (pg_dump nightly + WAL archiving for hosted)
- [ ] `helmet` is enabled (already done in `server/index.ts`)
- [ ] Rate limiters active:
  - 300 req/min global (`/api/`)
  - 30 req / 15 min on `/api/auth/login` and `/api/auth/register`
  - 5 starts/min on `/api/export`
- [ ] `express.json({ limit: '1mb' })` to cap payloads
- [ ] No secrets committed to git (`.env` is git-ignored)

---

## 10. Plan enforcement (how it works)

Each export request through `POST /api/export` is checked against the user's plan:

| Check | Source | Failure |
|---|---|---|
| Auth | `requireAuth` middleware | 401 |
| `format=react|both` requires `plan.allowReact` | `Plan.allowReact` | 403 + `upgrade: true` |
| Requested `maxPages` ≤ `plan.maxPagesPerCrawl` | `Plan.maxPagesPerCrawl` | 403 + `upgrade: true` |
| Monthly export count < `plan.maxExportsPerMonth` | `prisma.exportJob.count` for current UTC month | 403 + `upgrade: true` |

Each export inserts an `ExportJob` row (status `processing` → `complete`/`error` on close, with bytes + page count).

---

## 11. Operations

### Logs
- Application logs via stdout — capture with pm2 or systemd journal.
- Add a log shipper (Logtail, Datadog, etc.) if desired.

### Health check
```
GET /api/health  →  { status: "ok", jobs: <inflight count> }
```

### Backups
```bash
# Nightly cron
pg_dump $DATABASE_URL | gzip > /backups/cleave-$(date +%F).sql.gz
```

### Disaster recovery
1. Provision a new Postgres instance.
2. Restore latest dump: `gunzip -c backup.sql.gz | psql $DATABASE_URL`.
3. Re-deploy app, point `DATABASE_URL` at restored DB.
4. Re-create webhook secret in Stripe dashboard if endpoint URL changed.

### Tmpfile cleanup
Export ZIPs are stored in the OS temp dir. They are deleted automatically 30 minutes after the job is created (in-memory job sweeper). For persistence beyond that window, integrate object storage (S3) — out of scope for v1.

---

## 12. Quick local-dev recap

```bash
# 1. Postgres running locally
brew services start postgresql@14
createdb cleave

# 2. Configure
cd web
cp .env.example .env   # then edit values

# 3. DB
npm run db:push
npm run db:seed

# 4. Run
npm run dev            # starts Vite (5173) + Express (3001)

# 5. Stripe (optional)
stripe listen --forward-to localhost:3001/api/billing/webhook
# paste the printed whsec_... into STRIPE_WEBHOOK_SECRET in web/.env, restart
```

Visit http://localhost:5173.
