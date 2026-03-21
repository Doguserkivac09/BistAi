# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Status:** No automated testing infrastructure configured

**Notable Findings:**
- No test files in application source code (`/lib`, `/components`, `/app`)
- No `jest.config.*`, `vitest.config.*`, or testing packages in `package.json`
- No test runner npm scripts (`npm run test` not defined)
- Dependencies include dev tooling (TypeScript, ESLint, Tailwind) but no test frameworks
- Potential test files found only in `node_modules/` (from dependencies like `@supabase/ssr`)

**Why:** Project prioritizes rapid feature delivery across 11+ phases with small team (Berk + Doğuş + Claude). Testing deferred to post-MVP stability phase.

## Current Testing Approach

**Manual Testing:**
- Developers test features manually during development
- Per CLAUDE.md (Test Kuralı): Manual verification after each change:
  1. TypeScript compilation: `npx tsc --noEmit`
  2. Next.js build: `npm run build`
  3. Manual navigation testing of affected pages
  4. DevTools console/network inspection
  5. Responsive design check (mobile + desktop)

**Code Review:**
- Team reviews changes via GitHub PRs
- Merge to `develop` requires pull request (enforced via branch protection)
- Changes logged in commit messages with structured format: `feat(scope): description`

## Test-Adjacent Patterns

**Validation:**
- Input validation happens client-side (React form checks) and server-side (API routes)
- TypeScript strict mode (`"strict": true` in `tsconfig.json`) provides type checking
- Example: `lib/api-client.ts` validates numeric bounds before calculations
- Type guards: `Number.isFinite()`, `Array.isArray()`, explicit type checks

**Error Handling (as quality assurance):**
- Try-catch blocks wrap all async operations (`lib/claude.ts`, `components/StockCard.tsx`)
- Network errors caught and logged: `console.error('[explain] Hata:', message)`
- Database errors wrapped with context: `throw new Error(\`Signal kaydedilemedi: ${error.message}\`)`
- Silent failure for non-critical operations: cache writes catch errors without rethrowing

**API Testing (Manual):**
- Rate limiting tested via `/lib/rate-limit.ts` which tracks requests in memory
- Example endpoints exercised during UI testing:
  - `/api/ohlcv?symbol=THYAO&days=90` — OHLCV data fetch
  - `/api/explain` — Signal explanation generation
  - `/api/signal-performance` — Performance recording
  - `/api/evaluate-signals` — Batch evaluation (internal token protected)

## Data Validation Patterns

**Server-Side (API Routes):**
```typescript
// From app/api/ohlcv/route.ts
if (!symbol || !symbol.trim()) {
  return NextResponse.json(
    { error: 'Sembol gerekli (örn: symbol=THYAO).' },
    { status: 400 }
  );
}

// Numeric bounds
const days = daysParam ? Math.min(365, Math.max(1, parseInt(daysParam, 10))) : 90;

// Enum validation
const allowed: YahooTimeframe[] = ['1H', '1G', '1W', '1A', '3A', '1Y'];
if (!allowed.includes(tf)) {
  return NextResponse.json({ error: '...' }, { status: 400 });
}
```

**Type Safety:**
- All inputs typed explicitly (no `any`)
- Runtime type checks before use:
  ```typescript
  // From app/api/evaluate-signals/route.ts
  if (
    rec == null ||
    rec.id == null ||
    rec.sembol == null ||
    typeof rec.sembol !== 'string' ||
    rec.sembol.trim() === '' ||
    !Number.isFinite(Number(rec.entry_price))
  ) {
    continue;
  }
  ```

**Null/Undefined Safety:**
- Nullish coalescing: `value ?? default`
- Optional chaining: `data?.error ?? defaultValue`
- Array access: Safe indexing with assertions where type-checked
  ```typescript
  const close = candidates[0]?.close; // Optional chaining
  if (close == null || !Number.isFinite(close)) return null; // Explicit null check
  ```

## Performance Testing (Implicit)

**Cache Verification:**
- `lib/claude.ts` caches AI explanations; repeated calls for same signal checked via `getCachedExplanation()`
- Cache expiration after 24 hours: `new Date(Date.now() + 24 * 60 * 60 * 1000)`

**Rate Limiting:**
- In-memory sliding window: `lib/rate-limit.ts` tracks timestamps and enforces limits
- IP-based isolation: `getClientIP()` extracts client IP for per-IP quotas
- Example from `app/api/explain/route.ts`: 20 requests/min per IP
- Test-like behavior: each call increments counter, limit enforced via sliding window

**Data Processing:**
- Signal detection functions (`lib/signals.ts`) process arrays with guard clauses:
  ```typescript
  if (candles.length < 20) return null; // Minimum data requirement
  ```
- Numeric calculations include safety checks:
  ```typescript
  const ratio = last.volume / avgVol;
  if (ratio < 1.8) return null; // Threshold-based filtering
  ```

## Integration Points Tested Manually

**Supabase Integration:**
- Auth: User signup/login via `lib/supabase.ts` (browser client)
- Database reads: Watchlist, saved signals, user profiles queried in pages
- Database writes: Signal performance records inserted async
- Error handling: All Supabase calls check `.error` property

**Yahoo Finance API:**
- `lib/yahoo.ts` fetches OHLCV data; tested via `app/api/ohlcv` endpoint
- Caching: 15-minute TTL reduces API calls
- Network resilience: Errors logged, empty array returned on failure

**Claude API:**
- `lib/claude.ts` calls Anthropic API for signal explanations
- Retry logic: Failed requests retry once after 1s delay
- Cache: Repeated calls within 24 hours use cached result
- Error handling: Graceful degradation with error message to user

**Next.js Features:**
- Server components: `app/dashboard/page.tsx` uses `createServerClient()` for auth
- Client components: `'use client'` directive used in interactive components
- App Router: File-based routing; no manual route configuration
- Metadata: SEO metadata in `app/layout.tsx` and per-page layouts

## Suggested Testing Additions (Post-MVP)

**Unit Tests (Priority: High):**
- `lib/signals.ts` — Signal detection algorithms (RSI divergence, volume anomaly, etc.)
  - Test with known price patterns (trend reversal, gap up/down)
  - Validate severity assignments match input conditions
  - Example: bullish divergence with RSI < 30 should return `severity: 'güçlü'`

- `lib/confidence.ts` — Confidence score calculation
  - Test sigmoid normalization with boundary values
  - Verify output range 0-100

- `lib/edge-engine.ts` — Statistical calculations (win rate, expectancy, Sharpe ratio)
  - Test with synthetic signal records
  - Validate edge cases (zero wins, all losses, NaN handling)

**Integration Tests (Priority: High):**
- API routes: `/api/ohlcv`, `/api/explain`, `/api/signal-performance`
  - Test with mock Supabase and Yahoo Finance
  - Verify rate limiting enforcement
  - Check error response formats

- Supabase interactions: Insert/query watchlist, saved signals, profiles
  - Use Supabase test client or in-memory mock
  - Verify RLS policies work as expected

**Component Tests (Priority: Medium):**
- `components/StockCard.tsx` — Props rendering, explanation loading state
- `components/SignalBadge.tsx` — Color/icon mapping per signal type/direction
- Dashboard/scanning pages — Async data loading, error states

**E2E Tests (Priority: Medium):**
- User signup → dashboard → tarama (scanning) → signal selection flow
- Watchlist add/remove → persistence → dashboard display
- AI explanation fetch → caching verification on repeat view

## Recommended Testing Stack (If Implemented)

**Framework:** Jest or Vitest
- Jest: broader ecosystem, more mature for Next.js
- Vitest: faster, closer to Vite; Next.js now supports both

**Setup:**
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom ts-jest @types/jest
npm install --save-dev @supabase/supabase-js-mock  # For Supabase mocking
```

**Config (jest.config.ts):**
```typescript
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    'components/**/*.tsx',
    '!**/*.d.ts',
  ],
};
```

**Example Test (lib/confidence.ts):**
```typescript
import { calculateConfidenceScore } from '@/lib/confidence';
import type { SignalEdgeStats } from '@/lib/edge-engine';

describe('calculateConfidenceScore', () => {
  it('returns null when insufficient sample', () => {
    const edge: SignalEdgeStats = {
      total_signals: 5,
      sufficient_sample: false,
      horizon_3d: null,
      horizon_7d: null,
      horizon_14d: null,
      composite_edge: null,
      final_score: null,
    };
    expect(calculateConfidenceScore(edge)).toBeNull();
  });

  it('returns 0 for zero or negative score', () => {
    const edge: SignalEdgeStats = {
      sufficient_sample: true,
      final_score: 0,
      // ... other fields
    };
    expect(calculateConfidenceScore(edge)).toBe(0);
  });

  it('applies sigmoid normalization correctly', () => {
    const edge: SignalEdgeStats = {
      sufficient_sample: true,
      final_score: 5,
      // ... other fields
    };
    const confidence = calculateConfidenceScore(edge);
    expect(confidence).toBeGreaterThan(50); // sigmoid(5) ≈ 0.993
    expect(confidence).toBeLessThanOrEqual(100);
  });
});
```

## Current Quality Assurance Level

**Strengths:**
- TypeScript strict mode catches many bugs at compile time
- API route validation prevents invalid data from reaching business logic
- Rate limiting prevents abuse and API cost overruns
- Error logging aids debugging in production
- Try-catch blocks prevent unhandled promise rejections

**Gaps:**
- No automated regression testing — breaking changes only caught via manual review
- No test coverage metrics
- No performance benchmarks for signal detection algorithms
- No load testing for concurrent signal scans
- Schema changes (migrations) not tested automatically

**Risk Level:** Moderate
- Core business logic (signal detection) untested algorithmically
- API integrations (Yahoo, Claude, Supabase) rely on manual testing + error handling
- UI rendering tested only manually
- Best suited for small team; larger team would benefit from test suite

---

*Testing analysis: 2026-03-19*
