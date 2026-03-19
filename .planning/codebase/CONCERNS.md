# Codebase Concerns

**Analysis Date:** 2026-03-19

## Tech Debt

**Silent Error Catches in Macro/FRED Data Fetching:**
- Issue: Multiple `catch {}` blocks silently swallow errors without logging detailed context. Makes production debugging difficult.
- Files: `lib/yahoo.ts` (lines 98, 191, 293), `lib/macro-data.ts`, `lib/fred.ts`
- Impact: When data fetching fails, users get empty arrays with no indication why. Missing data silently degrades signal accuracy.
- Fix approach: Replace silent catches with structured logging (console.error with context). Return error markers in response types instead of empty arrays. Implement circuit breaker pattern for cascading failures.

**In-Memory Rate Limiter Scale Limitation:**
- Issue: `lib/rate-limit.ts` uses Map-based in-memory sliding window. No persistence across server restarts.
- Files: `lib/rate-limit.ts`
- Impact: On serverless deployments or multi-instance setups, rate limits are per-instance, not global. Malicious actors can spam from multiple paths simultaneously.
- Fix approach: For production, migrate to Redis (Upstash provides free tier). Current Map is adequate for development-only.
- Priority: Medium (blocks scale-out architecture)

**AI Cache Silent Failure:**
- Issue: `lib/claude.ts` cache operations (lines 37-40, 58-60) catch all errors silently. If Supabase service role key is missing, cache is disabled with no warning.
- Files: `lib/claude.ts` (getCachedExplanation, setCachedExplanation functions)
- Impact: Cache doesn't work in production if env var missing, but no error is raised. AI costs spike unexpectedly.
- Fix approach: Log cache failures. Validate service role key at startup with env.ts. Warn if caching disabled.

**Unvalidated Environment Variables:**
- Issue: Many env vars are accessed with `??` defaults or assumed to exist, but not validated at startup.
- Files: `lib/env.ts` (should exist but minimal), `app/api/stripe/webhook/route.ts` (lines 17-18), `app/api/evaluate-signals/route.ts` (lines 10-15)
- Impact: Misconfigured deployment silently fails. Stripe webhook handler crashes if SUPABASE_SERVICE_ROLE_KEY missing.
- Fix approach: Implement strict startup validation in `lib/env.ts`. Throw on missing critical keys before app boots.

## Known Bugs

**Stripe Webhook Error Handling Gap:**
- Symptoms: If Supabase update fails during webhook processing, webhook returns 500 but Stripe sees success. Next retry won't fire.
- Files: `app/api/stripe/webhook/route.ts` (lines 65-69, 81-84)
- Trigger: Database constraint violation during subscription update, or service role key misconfigured
- Workaround: Stripe customer_id may update via checkout but tier won't. User sees "free" tier despite paying. Manual database update needed.
- Fix approach: Wrap Supabase operations in transaction-like logic. Re-fetch to verify update succeeded. Log failed updates for manual audit.

**Backtesting Empty State Hidden:**
- Symptoms: Backtesting page loads with zero signals but displays generic "no data" state. No indication if: no evaluated signals exist, filters too strict, or data query failed.
- Files: `app/api/backtesting/route.ts` (lines 78-94), `app/backtesting/page.tsx` (loads state)
- Trigger: First time usage, or all signals unevaluated
- Workaround: Manually trigger signal evaluation via `/api/evaluate-signals` internal endpoint
- Fix approach: Return separate error codes for "no evaluated data" vs "query failed". UI differentiates helpful messages.

**Composite Signal Direction Logic Asymmetry:**
- Symptoms: Bullish signal (yukari) receives positive macro score directly. Bearish signal (asagi) receives inverted macro score. But if macro score is 0, both signals treated identically.
- Files: `lib/composite-signal.ts` (lines 85-88)
- Trigger: Neutral macro environment (VIX, CDS, USD/TRY all flat)
- Impact: Medium-low; only affects edge case of zero macro score
- Fix approach: Document asymmetry in comments. Consider symmetric scoring: macro score adjusted for direction, but always proportional to abs(score).

## Security Considerations

**Service Role Key Exposure Risk:**
- Risk: SUPABASE_SERVICE_ROLE_KEY stored in .env.local and used in multiple API routes without encryption. If env leaked, attacker can bypass all RLS.
- Files: `app/api/stripe/webhook/route.ts`, `app/api/evaluate-signals/route.ts`, `lib/claude.ts`, and all service client creations
- Current mitigation: .env.local in .gitignore; should never be committed
- Recommendations:
  1. Add pre-commit hook to verify .env files not staged
  2. Use Supabase API Keys with narrowest scope possible
  3. Consider proxy pattern: sensitive operations via secure internal endpoint, not direct client calls
  4. Rotate keys monthly in production

**Stripe Price ID Exposure:**
- Risk: STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM stored as env vars. Publicly visible in JavaScript if not careful.
- Files: `app/api/stripe/webhook/route.ts` (line 24), potentially frontend code
- Current mitigation: Price IDs are not secret (published on pricing page anyway)
- Recommendations: OK to expose; confirm they're only price IDs, not full product data

**Missing Input Validation on Community Posts:**
- Risk: Post title/content validated only for length (3-200, 10-5000 chars). No sanitization of HTML/scripts.
- Files: `app/api/community/posts/route.ts` (lines 124-133)
- Current mitigation: React escapes output by default. Tailwind/UI framework limits injection vectors.
- Recommendations: Add explicit HTML sanitization (DOMPurify or similar) before storing. Validate content doesn't contain malicious patterns.

**Rate Limit IP Spoofing:**
- Risk: Rate limiting based on x-forwarded-for header. If app deployed behind misconfigured proxy, attacker can spoof IPs.
- Files: `lib/rate-limit.ts` (getClientIP function, line 79-82)
- Current mitigation: Only trusts first IP in comma-separated list (correct approach for most proxies)
- Recommendations: Document proxy configuration required. Consider adding env var for proxy depth.

## Performance Bottlenecks

**N+1 Query in Community Feed:**
- Problem: Fetching posts with `select(*, author:...)` works, but fetching liked posts is separate query (line 73-78). If 20 posts per page, that's 1 + 1 = 2 queries now, but scales linearly with post additions.
- Files: `app/api/community/posts/route.ts` (lines 73-78)
- Cause: Could join likes table in initial query with `select(..., likes!posts_id(...))` to get single query
- Improvement path: Rewrite query to include likes join. Add index on likes(post_id, user_id).

**Full Page Render on Macro State Change:**
- Problem: `/app/makro/page.tsx` fetches 4 separate endpoints (macro, risk, sectors, alerts) in parallel. If one fails, entire page shows error. No partial loading.
- Files: `app/makro/page.tsx` (lines 238-247)
- Cause: Promise.all rejects on first failure
- Improvement path: Use Promise.allSettled. Show partial data with error banners for failed sections.

**Yahoo Finance Cache Unbounded Growth:**
- Problem: In-memory OHLCV cache has 500-entry limit, but evicts FIFO instead of LRU. Unused stale entries not cleaned.
- Files: `lib/yahoo.ts` (lines 28-35)
- Cause: Simple Map without TTL eviction per key
- Improvement path: Implement LRU cache (e.g., lru-cache npm package) or TTL-based eviction. Monitor cache hit rate.

**Backtesting Performance on Large Signal Sets:**
- Problem: `runBacktest()` iterates all records multiple times (calculating wins, returns, MFE/MAE). With 10k+ signals, becomes slow.
- Files: `lib/backtesting.ts` (calculateWinRate, calculateAverageReturn, etc.)
- Cause: Multiple sequential passes over array instead of single pass
- Improvement path: Refactor into single pass with accumulators. Profile with 10k+ records.

## Fragile Areas

**Macro Data Type Union Inconsistency:**
- Files: `app/makro/page.tsx` (lines 37-51)
- Why fragile: Turkey data can be `{ value: number, ...other } | number | null`. Frontend code must handle all three cases. Easy to miss null check or number case.
- Safe modification: Normalize all macro indicators to same shape: `{ value: number; change?: number; unit?: string } | null`
- Test coverage: No unit tests for null/number edge cases in type narrowing

**Supabase RLS Bypass in Service Role Calls:**
- Files: Multiple API routes creating service clients
- Why fragile: Service role bypasses RLS. If query logic wrong, returns unintended data to users.
- Safe modification: Add RLS policy double-check. Example: in `/api/community/posts`, even with service role, filter by `auth.uid() = user_id` explicitly.
- Test coverage: No test suite verifies RLS policies work as intended

**Composite Signal Weight Hardcoding:**
- Files: `lib/composite-signal.ts` (lines 63-67: WEIGHTS.TECHNICAL = 0.5, MACRO = 0.3, SECTOR = 0.2)
- Why fragile: If business decides to shift confidence, must touch 3 files (composite-signal, any dashboard display, documentation). No single source of truth.
- Safe modification: Move weights to `lib/config.ts` or database. UI can display current weights to users.
- Test coverage: No tests verify weight changes propagate correctly

**Realtime Channel Unsubscribe Race Condition:**
- Files: `lib/use-realtime-comments.ts` (lines 42-45)
- Why fragile: Component unmounts while subscription in progress. Race between `removeChannel` and pending `subscribe()` resolution.
- Safe modification: Store subscription as promise in ref, cancel on unmount
- Test coverage: No tests for rapid mount/unmount cycles

## Scaling Limits

**Current Resource:**
- **In-Memory Caches**: Yahoo OHLCV (500 entries × ~500KB = 250MB), rate limiter (unbounded)
- **Database**: Supabase free tier has 500MB storage, 50k rows soft limit
- **API Rate Limits**: 10 community posts/hour per IP, no global limits on signal evaluation or macro API

**Limit:**
- Supabase hits row limits around 50k signal_performance rows (current: unknown, likely under 1k)
- Memory usage grows linearly with signal evaluation load; no cleanup for old cache entries
- Public APIs (macro, risk, sectors) have no client-level rate limit; spammable

**Scaling Path:**
1. Migrate rate limiter to Redis (Upstash free tier: 10k requests/day)
2. Archive old signal_performance records (>6 months) to cold storage
3. Implement API key tier system (free API keys limited to 10 req/min)
4. Scale DB: Move to PostgreSQL-compatible Neon or Supabase Pro ($25/mo)

## Dependencies at Risk

**Stripe SDK (@stripe/stripe-js):**
- Risk: Heavily used in checkout flow. Outdated version could have security patches.
- Current: `stripe: ^20.4.1` (from package.json)
- Impact: If vulnerability in webhook validation, attackers could forge subscription events
- Migration plan: Pin to latest major version. Stripe maintains good backward compatibility.

**Next.js 14.2.18:**
- Risk: Older version; latest stable is 14.x. May miss security patches if not on latest 14.z.
- Current: `next: 14.2.18`
- Impact: Potential XSS via server component rendering, authentication bypass in middleware
- Migration plan: Update to latest 14.2.z quarterly. Next 15 will be major upgrade (future).

**Zustand State (if used for critical data):**
- Risk: Not found in actual code; imported in package.json but not used
- Current: `zustand: ^5.0.1` (unused)
- Impact: Dead dependency adds attack surface
- Migration plan: Remove from package.json

## Missing Critical Features

**No Request Logging for Audit Trail:**
- Problem: API requests aren't logged. If dispute arises (e.g., "user claims they didn't make that trade"), no way to prove request happened.
- Blocks: Compliance, debugging, fraud investigation
- Impact: High
- Approach: Add request ID, log all POST requests to signal/community/stripe endpoints

**No Subscription Expiry Check on Client:**
- Problem: Tier-gating helpers (`lib/tier-guard.ts`) only check `tier` column, not `tier_expires_at`. Expired subscriptions still have pro tier.
- Blocks: Preventing unpaid users from accessing premium features
- Impact: High (revenue leakage)
- Approach: Add `isSubscriptionActive(tier, expiresAt)` helper. Use in all tier-gated endpoints.

**No Data Consistency Validation After Bulk Updates:**
- Problem: When `/api/evaluate-signals` batch-updates 200 signal_performance records, no verification that update succeeded for all rows.
- Blocks: Reliable backtesting (some signals marked evaluated, others not, creating data gaps)
- Impact: Medium (silent data corruption)
- Approach: Return count of affected rows. Log warnings if count < expected.

## Test Coverage Gaps

**API Error Paths:**
- What's not tested: 401/403/500 responses from API routes. Silent error handling branches.
- Files: `app/api/community/posts/route.ts` (all catch blocks), `app/api/stripe/webhook/route.ts`
- Risk: Errors go unnoticed until production incident
- Priority: High (10 lines of test code would catch 80% of bugs)

**Rate Limit Edge Cases:**
- What's not tested: Exactly maxRequests at window boundary, cleanup interval timing
- Files: `lib/rate-limit.ts`
- Risk: Off-by-one errors, memory leaks from failed cleanup
- Priority: Medium

**Composite Signal Weight Math:**
- What's not tested: What happens if all components are null? If weights sum != 1.0?
- Files: `lib/composite-signal.ts` (lines 94-98)
- Risk: NaN propagation, undefined confidence scores
- Priority: Medium

**Database Constraint Violations:**
- What's not tested: Duplicate signal_performance entries (unique constraint), profile tier mismatch
- Files: Schema and API routes that insert
- Risk: Silent failures, cascade deletes wiping user data
- Priority: High

**Realtime Subscription Lifecycle:**
- What's not tested: Channel cleanup on error, subscription while component unmounting
- Files: `lib/use-realtime-comments.ts`
- Risk: Memory leaks, stale subscriptions, missed updates
- Priority: Medium

---

*Concerns audit: 2026-03-19*
