# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

**Financial Data:**
- Yahoo Finance - OHLCV (candlestick) data for BIST stocks and macro indicators
  - SDK/Client: Built-in `fetch` (no SDK)
  - Endpoint: `query1.finance.yahoo.com/v8/finance/chart/{symbol}`
  - Auth: None (public API)
  - Used in: `lib/yahoo.ts`, `lib/macro-data.ts`
  - Macro symbols: VIX, DXY, US 10Y Yield, USD/TRY, EEM, Brent Oil
  - Symbol convention: BIST stocks use `.IS` suffix (e.g., `THYAO.IS`)

- Federal Reserve Economic Data (FRED) API - US economic indicators
  - SDK/Client: Built-in `fetch` with retries
  - Endpoint: `api.stlouisfed.org/fred/series/data`
  - Auth: `FRED_API_KEY` (env var)
  - Used in: `lib/fred.ts`
  - Series tracked: Fed Funds Rate (DFF), CPI, GDP Growth, Unemployment, Manufacturing Employment
  - Frequency: Daily/Monthly/Quarterly (series-dependent)
  - Caching: 1 hour TTL in-memory

- Anthropic Claude API - AI signal explanations
  - SDK/Client: `@anthropic-ai/sdk` (version 0.32.1)
  - Model: `claude-3-5-haiku-20241022` (low-cost, fast)
  - Auth: `ANTHROPIC_API_KEY` (env var)
  - Endpoints: `messages.create` with system + user prompts
  - Used in: `lib/claude.ts`
  - Purpose: Generate natural language explanations for technical signals (v1) and composite signals with macro context (v2)
  - Rate: ~$0.80 per 1M input tokens, $4 per 1M output tokens
  - Caching: 24-hour AI result cache in Supabase `ai_cache` table to reduce API calls

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side)
  - Client: `@supabase/supabase-js` (browser) + `@supabase/ssr` (server/middleware)
  - Authentication: Built-in Supabase Auth (email/password, magic link, OAuth providers)
  - RLS: Row-level security policies enforce per-user data isolation
  - Key tables:
    - `auth.users` - Supabase managed user accounts
    - `profiles` - User profiles (created_at, tier, stripe_customer_id, stripe_subscription_id, tier_expires_at)
    - `watchlist` - User watched stocks
    - `saved_signals` - User saved technical signals
    - `signal_performance` - Recorded signal outcomes (buy/sell/hold + regime + time to close)
    - `ai_cache` - Claude API response cache (24h TTL)
    - `macro_snapshots` - Historical macro indicator data (daily snapshots)
    - `posts` - Community posts
    - `comments` - Community comments on posts
    - `likes` - Post/comment likes
    - `moderation_reports` - Content moderation reports
  - Backups: Supabase automatic daily backups (included in free tier)

**File Storage:**
- Local filesystem only - No S3 or CDN integration
- User avatars/images: Not yet implemented (reserved for future phases)

**Caching:**
- In-memory caching: `lib/yahoo.ts` (5 min TTL for OHLCV), `lib/macro-data.ts` (15 min TTL), `lib/fred.ts` (1 hour TTL)
- Request-level cache: `lib/macro-service.ts` (30 sec TTL) prevents duplicate API calls within same request
- Database cache: `ai_cache` table in Supabase for Claude API responses (24 hour TTL)
- No Redis/Memcached — all in-memory caches are process-local

## Authentication & Identity

**Auth Provider:**
- Supabase Auth - Custom implementation via `@supabase/ssr`
  - Methods: Email/password (signup + login), password reset, magic link (configurable)
  - Flow: `app/giris/page.tsx` (login), `app/kayit/page.tsx` (signup)
  - Session: JWT tokens stored in Supabase session cookies
  - Middleware: `middleware.ts` validates session on protected routes (/dashboard, /tarama, /hisse/*, /profil, /topluluk/*)
  - Auto-redirect: Unauthenticated users → login page with redirect callback

**User Identification:**
- `supabase.auth.getUser()` returns UUID + email in middleware/server actions
- Frontend context: User accessible via Supabase client (`createClient()`)

## Monitoring & Observability

**Error Tracking:**
- Not integrated (console.error used for logging)
- No Sentry, LogRocket, or similar service

**Logs:**
- Console logging only (console.error, console.warn, console.log)
- Example patterns in `lib/yahoo.ts`: `[Yahoo] fetchOHLCV ağ hatası`, `[FRED] API hatası`
- No centralized logging service (no Loggly, Datadog, etc.)

## CI/CD & Deployment

**Hosting:**
- Vercel (implied via Next.js 14 defaults) or self-hosted Node.js
- Database: Supabase Cloud
- Build: `npm run build` (Next.js static/incremental generation)
- Start: `npm start` (Next.js production server)

**CI Pipeline:**
- Not configured (no .github/workflows, no CI service detected)
- Manual deployment workflow implied

**Environment Configuration:**
- Local: `.env.local` (git-ignored)
- Production: Vercel Env Vars or hosting provider secrets
- Validation: `lib/env.ts` checks required vars at startup

## Webhooks & Callbacks

**Incoming:**
- Stripe Webhook Endpoint: `POST /api/stripe/webhook`
  - Signature validation: `stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)`
  - Events handled:
    - `checkout.session.completed` - User purchased subscription
    - `customer.subscription.created` - New subscription created
    - `customer.subscription.updated` - Subscription details changed
    - `customer.subscription.deleted` - Subscription canceled
    - `invoice.payment_failed` - Payment failed (Stripe handles retries)
  - Payload: Raw text body + `stripe-signature` header
  - Used in: `app/api/stripe/webhook/route.ts`
  - Auth: Signature verification via `STRIPE_WEBHOOK_SECRET`

- Cron Endpoints (Internal API):
  - `POST /api/cron/evaluate` - Trigger signal evaluation (Phase 3)
  - `POST /api/cron/macro` - Snapshot macro data to `macro_snapshots` table (Phase 4.5)
  - `POST /api/cron/macro-refresh` - Refresh cached macro quotes (Phase 4.5)
  - Auth: `CRON_SECRET` header verification

**Outgoing:**
- Stripe Checkout Redirect: Frontend redirects user to Stripe Checkout session URL
- Stripe Customer Portal: User redirected to manage subscriptions (auto-generated by Stripe)
- Supabase Realtime: WebSocket subscription to `comments` table for live updates (Phase 10.7)

## Rate Limiting

**Implementation:**
- Custom IP-based rate limiting in `lib/rate-limit.ts` (Phase 3)
- Applied to signal tarama and API endpoints
- Limits enforced per user tier:
  - **Free**: 5 signals/day
  - **Pro**: Unlimited signals
  - **Premium**: Unlimited signals

## Payment Processing

**Stripe Integration:**
- SDK: `stripe` v20.4.1 (server-side only)
- Keys:
  - `STRIPE_SECRET_KEY` - Webhook construction + subscription management
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Client-side checkout (NOT used directly, handled by Stripe elements)
  - `STRIPE_WEBHOOK_SECRET` - Webhook signature verification
- Price IDs:
  - `STRIPE_PRICE_PRO` - Pro plan monthly subscription
  - `STRIPE_PRICE_PREMIUM` - Premium plan monthly subscription
- Endpoints:
  - `POST /api/stripe/checkout` - Create checkout session (Phase 11.3)
  - `POST /api/stripe/portal` - Generate customer portal link (Phase 11.3)
  - `POST /api/stripe/webhook` - Handle Stripe events (Phase 11.4)
- Checkout Flow: Frontend → Stripe Checkout Session → Webhook updates profiles.tier
- Subscription Status: Stored in `profiles` table (stripe_customer_id, stripe_subscription_id, tier, tier_expires_at)

---

*Integration audit: 2026-03-19*
