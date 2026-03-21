# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Next.js 14 App Router with layered signal analysis engine + macro/sector analysis + user tier system

**Key Characteristics:**
- Backend-driven signal detection (server-side technical analysis)
- Request-level caching for macro data to prevent repeated fetches
- Three-component composite decision system (technical × macro × sector)
- Server-side rendering for initial page load + client-side interactivity
- Supabase Auth + Row-level security for data isolation
- Rate limiting per IP for all API endpoints

## Layers

**UI/Page Layer:**
- Purpose: Server-side rendered pages and client components
- Location: `app/` directory (pages, layouts, loading states)
- Contains: Route handlers, page components, nested layouts
- Depends on: Components, API clients, Supabase server client
- Used by: Users through browser

**API Route Layer:**
- Purpose: RESTful endpoints for signal detection, macro data, backtesting
- Location: `app/api/`
- Contains: Route handlers (`route.ts` files) with rate limiting
- Depends on: lib/ engines, supabase-server, rate-limit
- Used by: Frontend (client-side fetch) and server actions

**Business Logic Layer:**
- Purpose: Core signal detection, macro scoring, sector analysis, backtesting
- Location: `lib/` directory
- Contains: Signal engines, macro aggregators, risk calculators, utilities
- Depends on: External APIs (Yahoo Finance, FRED), Supabase, types
- Used by: API routes, server actions, components

**Data Access Layer:**
- Purpose: Supabase queries, external API calls, caching
- Location: `lib/supabase*.ts`, `lib/yahoo.ts`, `lib/fred.ts`, `lib/macro-*.ts`
- Contains: Query builders, fetch functions, cache logic
- Depends on: External services (Supabase, Yahoo Finance, FRED)
- Used by: Business logic layer

**Component Layer:**
- Purpose: Reusable UI components and layouts
- Location: `components/` directory
- Contains: React components (TSX), shadcn/ui wrappers
- Depends on: lib/api-client (client-side), zustand (state), lucide-react (icons)
- Used by: Pages and other components

## Data Flow

**Signal Scanning Flow:**

1. User opens `/tarama` (scan page, client component)
2. `ScanProgress` component initiates scan across all BIST100 symbols
3. For each symbol: `fetchOHLCVClient()` → `/api/ohlcv` → `lib/yahoo.ts` fetches 5Y candles + cache
4. Client-side: `detectAllSignals()` runs 4 signal detectors (RSI divergence, volume anomaly, trend start, support/resistance)
5. Each signal paired with `/api/explain` → Claude AI generates Türkçe explanation
6. Results filtered by signal type + direction, strongest per symbol selected
7. User can save signal → `supabase.from('saved_signals').insert()`

**Macro Scoring Flow:**

1. Multiple routes (`/api/macro`, `/api/risk`, `/api/sectors`, `/api/alerts`) all need macro data
2. `lib/macro-service.ts` provides singleton request-level cache (30s TTL)
3. `getMacroFull()` orchestrates parallel fetches:
   - `fetchAllMacroQuotes()` from Yahoo (VIX, DXY, US10Y, USD/TRY)
   - `fetchAllTurkeyMacro()` from TCMB/web (TCMB policy rate, CDS, inflation)
   - `fetchAllFredData()` from FRED API (Fed rate, CPI, GDP, PMI)
4. `calculateMacroScore()` combines into -100/+100 score with component breakdown
5. `calculateRiskScore()` creates separate 0-100 risk gauge
6. Results returned to frontend, displayed on `/makro` page

**Composite Signal Flow (Phase 6.1):**

1. After technical signal detected + macro data available → `calculateCompositeSignal()`
2. Inputs: `StockSignal`, `MacroScoreResult`, `SectorMomentum`, `RiskScoreResult`
3. Weights: Technical 50% + Macro 30% + Sector 20% = composite score
4. Risk adjustment reduces confidence if market volatility high
5. Output: `CompositeSignalResult` with decision (STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL) + confidence + context
6. Context fed to `generateCompositeExplanation()` for AI explanation

**User Tier & Subscription Flow:**

1. User signs up → `auth.users` created
2. Middleware calls `profiles` insert via trigger (auto-create with tier='free')
3. `/api/stripe/checkout` → Stripe session → user redirects to Stripe
4. Payment successful → Stripe webhook `/api/stripe/webhook` calls Supabase:
   - Updates `profiles.stripe_customer_id`, `tier`, `tier_expires_at`, `subscription_status`
5. Feature endpoints check tier via `lib/tier-guard.ts` helper
6. If tier required > user tier → return 403 or upgrade CTA

**State Management:**

- **Server-side:** Supabase auth state (user session)
- **Client-side:** Zustand store for watchlist, UI toggles (not persisted)
- **Session:** Next.js cookies (Supabase SSR auth cookie)
- **Request-level cache:** `macro-service.ts` global variables (reset per request in edge)

## Key Abstractions

**Signal Detection (`lib/signals.ts`):**
- Purpose: Technical analysis pattern recognition
- Examples: `detectRsiDivergence()`, `detectVolumeAnomaly()`, `detectTrendStart()`, `detectSupportResistanceBreak()`
- Pattern: Pure functions taking candles → signal or null; no state

**Edge Confidence (`lib/edge-engine.ts`):**
- Purpose: Compute historical signal performance statistics
- Pattern: Query `signal_performance` table, calculate win rate + MFE/MAE for signal type + regime combo
- Output: `SignalEdgeStats` with confidence percentile

**Macro Service (`lib/macro-service.ts`):**
- Purpose: Single entry point for all macro data (prevents duplicate fetches)
- Pattern: Request-level cache with 30s TTL; returns aggregated bundle
- Exports: `getMacroBundle()`, `getMacroFull()`, `getMacroScore()`, `getRiskScore()`

**Composite Signal (`lib/composite-signal.ts`):**
- Purpose: Multi-factor decision engine
- Pattern: Weighted sum of technical + macro + sector scores → decision category
- Exports: `calculateCompositeSignal()`, `calculateCompositeSignals()` (batch)

**Sector Mapping (`lib/sectors.ts`):**
- Purpose: BIST100 symbol → sector + macro sensitivity
- Pattern: Lookup tables with hardcoded BIST100 list grouped by sector
- Exports: `getSector()`, `getSymbolsBySector()`, `groupBySector()`

**Tier Guard (`lib/tier-guard.ts`):**
- Purpose: Feature availability per subscription tier
- Pattern: Lookup table (`FeatureLimits`) + comparison function `hasTierAccess()`
- Exports: `hasTierAccess()`, `needsUpgrade()`, `getFeatureLimits()`

## Entry Points

**Landing Page:**
- Location: `app/page.tsx`
- Triggers: GET `/`
- Responsibilities: Hero section, feature overview, CTA buttons (Sign up / Get started)

**Auth Routes:**
- Location: `app/giris/page.tsx`, `app/kayit/page.tsx`
- Triggers: GET `/giris`, GET `/kayit`
- Responsibilities: Login/signup forms, redirect to dashboard on success
- Middleware check: If authenticated → redirect to `/dashboard`

**Dashboard:**
- Location: `app/dashboard/page.tsx`
- Triggers: GET `/dashboard` (requires auth via middleware)
- Responsibilities: Watchlist + recent signals overview, stats cards
- Data: Server-side fetch from Supabase for user's watchlist + saved signals

**Scan Page:**
- Location: `app/tarama/page.tsx`
- Triggers: GET `/tarama` (client component, requires auth)
- Responsibilities: BIST100 batch scan, filter by signal type + direction, save signals
- Data: Client-side fetching with progress bar

**Stock Detail:**
- Location: `app/hisse/[sembol]/page.tsx`
- Triggers: GET `/hisse/[symbol]`
- Responsibilities: Individual stock detail page with chart, signals, AI explanation
- Data: Server-side + client-side OHLCV fetch + macro context

**Macro Dashboard:**
- Location: `app/makro/page.tsx`
- Triggers: GET `/makro`
- Responsibilities: Macro skor gauge, risk widget, sector heatmap, Turkey/US indicators
- Data: Client-side fetch from `/api/macro`, `/api/risk`, `/api/sectors`

**Backtesting:**
- Location: `app/backtesting/page.tsx`
- Triggers: GET `/backtesting`
- Responsibilities: Signal performance analysis, win rate by type + regime, comparisons
- Data: Server-side query `/api/backtesting` with filters

**Profile:**
- Location: `app/profil/page.tsx`
- Triggers: GET `/profil` (requires auth)
- Responsibilities: User profile form, tier display, subscription management link
- Data: Server-side fetch from `profiles` table + Stripe portal URL

**Pricing:**
- Location: `app/fiyatlandirma/page.tsx`
- Triggers: GET `/fiyatlandirma`
- Responsibilities: Feature comparison, pricing cards, checkout buttons
- Data: Hardcoded price IDs from Stripe

**Community:**
- Location: `app/topluluk/page.tsx`, `/[id]/page.tsx`, `/yeni/page.tsx`
- Triggers: GET/POST `/topluluk*` (requires auth)
- Responsibilities: Post feed, post creation, comments, likes, moderation
- Data: Supabase queries to `posts`, `comments`, `likes` tables

## Error Handling

**Strategy:** Try-catch in route handlers + error boundaries in components; toast notifications for user-facing errors

**Patterns:**

- **API Routes:** Wrap in try-catch, log error, return `NextResponse.json({error: message}, {status: 500})`
- **Server Actions:** Throw error (caught by middleware) or return error object to client
- **Client Components:** Use `useCallback` + catch, show toast via `sonner.toast.error()`
- **Auth Errors:** Redirect to login with `?redirect=` param
- **Rate Limit Errors:** Return 429 with `Retry-After` header

Examples:
- `app/api/macro/route.ts`: Catches fetch errors, logs, returns 500
- `app/dashboard/page.tsx`: Redirects if not authenticated via middleware
- `app/tarama/page.tsx`: Wraps scan in toast error handler

## Cross-Cutting Concerns

**Logging:**
- Console.error for server-side errors (no centralized logging service)
- Client errors shown via toast notifications

**Validation:**
- Input validation in API routes (null checks, type narrowing)
- Zod schema in `lib/env.ts` for environment variables

**Authentication:**
- Supabase Auth with SSR session via `@supabase/ssr`
- Middleware enforces auth on protected routes
- `lib/auth-server.ts` helper for server-side user check

**Caching:**
- Yahoo Finance OHLCV cache: in-memory per fetch (no TTL)
- Macro data request-level cache: 30s in `macro-service.ts`
- Next.js default caching for static assets

**Rate Limiting:**
- IP-based in-memory cache in `lib/rate-limit.ts`
- Per-route limits configured in route handlers (30 req/min for `/api/macro`)
- Returns 429 with `Retry-After` header

---

*Architecture analysis: 2026-03-19*
