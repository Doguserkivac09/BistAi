# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- TypeScript 5.6.3 - Full codebase, strict mode enabled
- JavaScript (Node.js) - Build tooling and runtime

**Secondary:**
- SQL - Supabase PostgreSQL migrations and RLS policies

## Runtime

**Environment:**
- Node.js (latest LTS) - Next.js runtime

**Package Manager:**
- npm (assumed from package.json)
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- Next.js 14.2.18 - App Router, server components, API routes, middleware
- React 18.3.1 - UI components, hooks

**UI & Styling:**
- Tailwind CSS 3.4.15 - Utility-first styling, configured in `tailwind.config.js`
- Radix UI - Unstyled, accessible component primitives (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-select`, `@radix-ui/react-slot`)
- Lucide React 0.460.0 - Icon library
- class-variance-authority 0.7.0 - Type-safe CSS class variants
- clsx 2.1.1 - Conditional class name utilities
- tailwind-merge 2.5.4 - Merge Tailwind classes safely
- tailwindcss-animate 1.0.7 - Animation utilities

**Data & State:**
- Zod 4.3.6 - Schema validation (environment variables, API requests)
- Zustand 5.0.1 - Lightweight state management

**UI Components/Notifications:**
- Sonner 2.0.7 - Toast notifications

**Charting:**
- lightweight-charts 4.2.0 - Financial charting (technical analysis candlestick/OHLCV charts)

**Testing:**
- Not explicitly configured in package.json; implied manual testing workflow

**Build/Dev:**
- TypeScript 5.6.3 - Compilation
- PostCSS 8.4.49 - CSS processing pipeline
- Autoprefixer 10.4.20 - Vendor prefix handling
- ESLint 8.57.1 + eslint-config-next - Linting

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.45.4 - Postgres database + auth client (browser-side)
- @supabase/ssr 0.8.0 - SSR-safe Supabase client for middleware/server (prevents duplicate sessions)
- @anthropic-ai/sdk 0.32.1 - Claude API for AI signal explanations (claude-3-5-haiku model)
- stripe 20.4.1 - Payment processing and subscription management (server-side Stripe client)

**Infrastructure:**
- next 14.2.18 - Full-stack framework

## Configuration

**Environment:**
- Variables validated with Zod schema in `lib/env.ts`
- Configuration file: `.env.local` (not committed, contains secrets)

**Required Environment Variables (Mandatory):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (public, safe in browser)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (secret, server-side only)

**Required Environment Variables (Conditional):**
- `STRIPE_SECRET_KEY` - Stripe secret key (sk_test_... or sk_live_...) — needed if payments enabled
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (whsec_...) — needed if webhooks enabled
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe public key (pk_test_...) — needed for client-side checkout
- `STRIPE_PRICE_PRO` - Stripe Price ID for Pro plan
- `STRIPE_PRICE_PREMIUM` - Stripe Price ID for Premium plan
- `NEXT_PUBLIC_SITE_URL` - Site URL for Stripe portal redirect (default: http://localhost:3000)
- `ANTHROPIC_API_KEY` - Claude API key (optional, but required for AI explanations to work)
- `SUPABASE_SERVICE_ROLE_KEY` - Also used for AI cache and async tasks

**Optional Environment Variables:**
- `INTERNAL_EVAL_TOKEN` - Secret token for `/api/evaluate-signals` cron endpoint
- `CRON_SECRET` - Secret token for `/api/cron/*` endpoints (macro refresh, evaluation)
- `FRED_API_KEY` - Federal Reserve Economic Data API key (free registration)
- `TCMB_API_KEY` - Turkish Central Bank API key (reserved for future use)
- `FRED_TIMEOUT_MS` - FRED API timeout in milliseconds (default: 10000)
- `FRED_MAX_RETRIES` - FRED API retry attempts (default: 2, max: 5)

**Build Configuration:**
- `next.config.mjs` - Minimal Next.js config with React strict mode enabled
- `tsconfig.json` - TypeScript strict mode, path aliases (`@/*` → root), ESNext module target
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.mjs` - PostCSS pipeline (Tailwind + Autoprefixer)

## Platform Requirements

**Development:**
- Node.js LTS (18+)
- npm (latest)
- Git (for version control)
- Supabase account (free tier supports development)
- Stripe account (test mode development)
- Anthropic API key for Claude (optional but recommended for local testing)

**Production:**
- Vercel (implicit via Next.js 14 App Router best practices) or self-hosted Node.js
- Supabase PostgreSQL database (required)
- Stripe live account (for payment processing)
- Anthropic Claude API key (for production AI explanations)

---

*Stack analysis: 2026-03-19*
