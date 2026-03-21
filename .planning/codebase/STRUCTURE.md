# Codebase Structure

**Analysis Date:** 2026-03-19

## Directory Layout

```
bistai/
├── app/                          # Next.js App Router pages & API routes
│   ├── api/                      # REST API endpoints
│   │   ├── alerts/              # GET /api/alerts — alert generation
│   │   ├── backtesting/         # GET /api/backtesting — performance analysis
│   │   ├── evaluate-signals/    # POST (internal) — batch signal evaluation
│   │   ├── explain/             # POST — Claude AI explanation generation
│   │   ├── macro/               # GET /api/macro — macro indicators + history
│   │   ├── ohlcv/               # GET /api/ohlcv — Yahoo Finance candles
│   │   ├── profile/             # GET /api/profile — user profile CRUD
│   │   ├── risk/                # GET /api/risk — risk score calculation
│   │   ├── sectors/             # GET /api/sectors — sector momentum data
│   │   ├── signal-performance/  # POST — save signal backtest results
│   │   ├── signal-stats/        # GET /api/signal-stats — edge statistics
│   │   ├── stripe/              # Stripe checkout, webhook, portal routes
│   │   └── auth/                # Auth callbacks (OAuth, logout)
│   ├── auth/                    # Auth pages & callbacks
│   ├── backtesting/             # GET /backtesting — signal performance UI
│   ├── dashboard/               # GET /dashboard — user home page
│   ├── fiyatlandirma/           # GET /fiyatlandirma — pricing page
│   ├── giris/                   # GET /giris — login page
│   ├── hisse/[sembol]/          # GET /hisse/AKBNK — stock detail page
│   ├── kayit/                   # GET /kayit — signup page
│   ├── makro/                   # GET /makro — macro indicators dashboard
│   ├── page.tsx                 # GET / — landing page
│   ├── profil/                  # GET /profil — user profile page
│   ├── sifre-guncelle/          # GET /sifre-guncelle — change password
│   ├── sifre-sifirla/           # GET /sifre-sifirla — password reset
│   ├── tarama/                  # GET /tarama — batch signal scan page
│   ├── topluluk/                # Community platform routes
│   │   ├── page.tsx             # Feed
│   │   ├── [id]/page.tsx        # Post detail
│   │   └── yeni/page.tsx        # New post form
│   ├── layout.tsx               # Root layout (Navbar, Toaster)
│   └── globals.css              # Tailwind CSS imports
├── components/                  # Reusable React components
│   ├── ui/                      # shadcn/ui button, card, input, etc.
│   ├── DashboardSignals.tsx     # Recent signals component
│   ├── DashboardWatchlist.tsx   # Watchlist component
│   ├── MiniChart.tsx            # Lightweight Charts wrapper
│   ├── Navbar.tsx               # Header (server + client split)
│   ├── NavbarClient.tsx         # Client navbar logic
│   ├── RiskGauge.tsx            # Risk score visualization
│   ├── SaveSignalButton.tsx     # Save to watchlist
│   ├── ScanProgress.tsx         # Scan progress bar
│   ├── SectorCard.tsx           # Individual sector card
│   ├── SectorHeatmap.tsx        # Sector grid heatmap
│   ├── SignalBadge.tsx          # Signal type + direction badge
│   ├── SignalExplanation.tsx    # AI explanation display
│   ├── StockCard.tsx            # Signal result card
│   ├── StockChart.tsx           # Interactive candlestick chart
│   ├── VixChart.tsx             # VIX trend visualization
│   ├── WatchlistButton.tsx      # Add/remove from watchlist
│   └── WatchlistPanel.tsx       # Sidebar watchlist widget
├── lib/                         # Business logic & utilities
│   ├── alerts.ts                # Alert generation (macro, risk, signal, sector)
│   ├── api-client.ts            # Client-side fetch wrappers
│   ├── auth-server.ts           # Server-side auth utilities
│   ├── backtesting.ts           # Signal performance analysis
│   ├── claude.ts                # Claude AI explanation generation + cache
│   ├── composite-signal.ts      # Multi-factor decision engine
│   ├── confidence.ts            # Edge-based confidence scoring
│   ├── edge-engine.ts           # Signal edge statistics calculation
│   ├── env.ts                   # Environment variable validation (Zod)
│   ├── fred.ts                  # FRED API (Fed Funds, CPI, GDP, PMI)
│   ├── macro-data.ts            # Yahoo Finance macro quotes (VIX, DXY, etc.)
│   ├── macro-score.ts           # Composite macro scoring (-100 to +100)
│   ├── macro-service.ts         # Request-level macro cache orchestrator
│   ├── performance.ts           # Signal performance persistence client
│   ├── performance-types.ts     # TypeScript interfaces for performance data
│   ├── rate-limit.ts            # IP-based rate limiter
│   ├── regime-engine.ts         # Market regime detection (bull/bear/sideways)
│   ├── risk-engine.ts           # Risk score calculation (0-100)
│   ├── sector-engine.ts         # Sector momentum + macro alignment
│   ├── sectors.ts               # BIST100 sector mapping
│   ├── signals.ts               # Signal detection (RSI, volume, trend, S/R)
│   ├── stripe.ts                # Stripe SDK initialization + helpers
│   ├── supabase.ts              # Client-side Supabase query helpers
│   ├── supabase-server.ts       # Server-side Supabase with SSR
│   ├── tier-guard.ts            # Subscription tier access control
│   ├── time-align.ts            # Market hours + data freshness
│   ├── turkey-macro.ts          # TCMB data (policy rate, CDS, inflation)
│   ├── use-realtime-comments.ts # Supabase Realtime hook
│   ├── utils.ts                 # Misc utilities (cn for className)
│   └── yahoo.ts                 # Yahoo Finance OHLCV fetch
├── types/
│   └── index.ts                 # Shared TypeScript interfaces (signals, users, BIST symbols)
├── supabase/
│   ├── migrations/              # SQL migration files (date-prefixed)
│   │   ├── 20260224_signal_performance.sql
│   │   ├── 20260313_macro_snapshots.sql
│   │   ├── 20260315_profiles.sql
│   │   ├── 20260315_community.sql
│   │   ├── 20260315_subscriptions.sql
│   │   └── 20260315_ai_cache.sql
│   └── schema.sql               # Current database schema (merged migrations)
├── .planning/
│   └── codebase/                # GSD codebase analysis documents
├── .vscode/                     # VSCode settings
├── middleware.ts                # Next.js auth + routing middleware
├── next.config.mjs              # Next.js configuration
├── tsconfig.json                # TypeScript configuration
├── package.json                 # Dependencies
└── tailwind.config.ts           # Tailwind CSS configuration
```

## Directory Purposes

**app/ — Pages & API Routes:**
- Purpose: Next.js App Router entry points (pages and API endpoints)
- Contains: Route handlers (.ts), page components (.tsx), layouts, loading states
- Key files: `page.tsx` (pages), `route.ts` (API), `layout.tsx` (nested layouts)

**app/api/ — REST API Endpoints:**
- Purpose: Server-side API handlers for frontend + internal cron/webhook
- Contains: Rate-limited routes, Supabase queries, external API calls
- Pattern: GET/POST handlers with error boundaries, rate limit checks
- Key: `/api/macro` aggregates all macro data + uses request-level cache

**components/ — Reusable UI:**
- Purpose: React components and shadcn/ui wrappers
- Contains: Button, Card, Input, Select (base UI) + domain components (SignalBadge, SectorHeatmap, etc.)
- Pattern: Server vs Client components split (Navbar.tsx is server, NavbarClient.tsx is client)

**lib/ — Business Logic:**
- Purpose: Core algorithms, data fetching, calculation engines
- Contains: Signal detection, macro scoring, risk calculation, API clients
- Pattern: Pure functions where possible; request-level caching in `macro-service.ts`

**types/ — Shared Interfaces:**
- Purpose: TypeScript type definitions used across layers
- Contains: `SignalDirection`, `OHLCVCandle`, `StockSignal`, BIST100 symbols array
- Pattern: Central source of truth for domain types

**supabase/ — Database:**
- Purpose: Database schema and migrations
- Contains: SQL files for tables (profiles, watchlist, saved_signals, signal_performance, etc.)
- Pattern: One migration per feature phase; merged into schema.sql

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root layout with Navbar + Toaster
- `app/page.tsx`: Landing page (logged out)
- `app/dashboard/page.tsx`: User dashboard (requires auth)
- `app/tarama/page.tsx`: Signal scan page
- `middleware.ts`: Auth + route protection

**Configuration:**
- `package.json`: Dependencies (Next.js 14, Supabase, Stripe, Claude SDK, Tailwind)
- `tsconfig.json`: TypeScript paths (`@/` alias for imports)
- `next.config.mjs`: Next.js config
- `tailwind.config.ts`: Tailwind CSS theme + plugins

**Signal Detection:**
- `lib/signals.ts`: 4 signal detectors (RSI divergence, volume anomaly, trend start, S/R break)
- `lib/edge-engine.ts`: Win rate + MFE/MAE statistics per signal type + regime
- `lib/confidence.ts`: Percentile ranking based on edge stats

**Macro Analysis:**
- `lib/macro-data.ts`: Yahoo Finance quotes (VIX, DXY, US10Y, USD/TRY)
- `lib/macro-score.ts`: Weighted composite score (-100 to +100)
- `lib/macro-service.ts`: Request-level cache + orchestration
- `lib/fred.ts`: Fed Funds, CPI, GDP, PMI from FRED API
- `lib/turkey-macro.ts`: TCMB policy rate, CDS, inflation

**Composite Decision:**
- `lib/composite-signal.ts`: Technical × Macro × Sector → BUY/HOLD/SELL
- `lib/sector-engine.ts`: Sector momentum + macro alignment rules
- `lib/risk-engine.ts`: Risk score (0-100) from volatility + CDS + USD/TRY

**User Management:**
- `lib/tier-guard.ts`: Feature access by subscription tier
- `lib/supabase-server.ts`: Server-side Supabase client
- `lib/auth-server.ts`: Get authenticated user
- `app/api/profile/route.ts`: Profile CRUD
- `app/api/stripe/webhook`: Subscription status updates

**Testing & Performance:**
- `lib/backtesting.ts`: Win rate analysis by signal type + regime
- `lib/performance.ts`: Save signal performance to Supabase
- `app/api/evaluate-signals/route.ts`: Batch signal evaluation + return calculation
- `app/backtesting/page.tsx`: Performance UI

## Naming Conventions

**Files:**
- Pages: `page.tsx` (in route directories)
- API routes: `route.ts` (in api/ subdirectories)
- Components: PascalCase (e.g., `StockCard.tsx`, `DashboardWatchlist.tsx`)
- Utilities: camelCase (e.g., `utils.ts`, `api-client.ts`)
- Types: `index.ts` or kebab-case (e.g., `performance-types.ts`)
- Migrations: `YYYYMMDD_feature.sql` (e.g., `20260315_profiles.sql`)

**Directories:**
- Route groups: kebab-case (e.g., `sifre-guncelle/`, `sifre-sifirla/`)
- Feature folders: kebab-case (e.g., `app/topluluk/`, `app/backtesting/`)
- UI components: `ui/` subdirectory (shadcn/ui)

**Functions & Variables:**
- Signal detectors: `detect*` (e.g., `detectRsiDivergence()`)
- Fetchers: `fetch*` (e.g., `fetchOHLCV()`, `fetchMacroQuote()`)
- Calculators: `calculate*` (e.g., `calculateMacroScore()`, `calculateRiskScore()`)
- Generators: `generate*` (e.g., `generateSignalExplanation()`)
- Server functions: lowercase with hyphens in file (e.g., `sifre-sifirla/page.tsx`)

**Types & Enums:**
- Interface: PascalCase (e.g., `CompositeSignalResult`, `MacroScoreResult`)
- Type alias: PascalCase (e.g., `SignalDirection`, `MarketRegime`)
- Enum-like constants: SCREAMING_SNAKE_CASE (e.g., `BIST_SYMBOLS`, `MACRO_SYMBOLS`)

## Where to Add New Code

**New Technical Signal Detector:**
- Add function to `lib/signals.ts` following `detect*` pattern
- Call from `detectAllSignals()` in same file
- Add signal type to `types/index.ts`
- Add test case to backtesting validation

**New Macro Indicator:**
- Fetcher: Add to `lib/macro-data.ts` or `lib/fred.ts` or `lib/turkey-macro.ts`
- Aggregator: Update `lib/macro-service.ts` to call new fetcher
- Scorer: Update weighting in `lib/macro-score.ts`
- UI: Add gauge/card to `app/makro/page.tsx`

**New API Endpoint:**
- Create `app/api/[feature]/route.ts` following pattern:
  1. Rate limit check with `checkRateLimit()`
  2. Try-catch error handling
  3. Call lib functions
  4. Return `NextResponse.json()`
- Add rate limit config at top of file

**New Page:**
- Create `app/[route]/page.tsx` (server component by default)
- Add layout file if nested routes needed: `app/[route]/layout.tsx`
- Add loading state: `app/[route]/loading.tsx`
- Update `middleware.ts` matcher if auth required
- Add navbar link in `components/NavbarClient.tsx`

**New Component:**
- Create in `components/` as TSX (e.g., `components/NewFeature.tsx`)
- Use "use client" if needs client interactivity
- Import from `@/components/ui` for base components
- Export from component file (no barrel exports)

**New Database Table:**
- Create migration file: `supabase/migrations/20260319_[feature].sql`
- Add RLS policies for access control
- Update `supabase/schema.sql` for reference
- Apply locally via Supabase CLI: `supabase db push`

**New Utility Function:**
- Pure logic → `lib/[domain].ts`
- UI helpers → `lib/utils.ts`
- Client-side fetching → `lib/api-client.ts`
- Server-side queries → `lib/supabase-server.ts`

**New Type:**
- Domain type → `types/index.ts`
- Response type → `lib/[domain]-types.ts`
- API request/response → inline in `app/api/[route]/route.ts`

## Special Directories

**app/auth/**
- Purpose: Authentication callback routes (OAuth, logout)
- Generated: No (hand-written)
- Committed: Yes

**supabase/migrations/**
- Purpose: Database schema change history
- Generated: Partially (by Supabase CLI)
- Committed: Yes (manually created)

**supabase/schema.sql**
- Purpose: Single-file reference of current schema
- Generated: No (merged manually for clarity)
- Committed: Yes

**.next/**
- Purpose: Next.js build output
- Generated: Yes (build process)
- Committed: No (.gitignore)

**node_modules/**
- Purpose: Installed dependencies
- Generated: Yes (npm install)
- Committed: No (.gitignore)

**.claude/**
- Purpose: Claude Code worktrees & hooks
- Generated: Yes (by Claude Code)
- Committed: No (.gitignore)

---

*Structure analysis: 2026-03-19*
