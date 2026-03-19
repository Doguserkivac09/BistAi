# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- `camelCase` for utility/service files: `signals.ts`, `confidence.ts`, `performance.ts`, `rate-limit.ts`
- `kebab-case` for API routes: `evaluate-signals`, `signal-stats`, `signal-performance`
- `PascalCase` for React components: `StockCard.tsx`, `SignalBadge.tsx`, `Navbar.tsx`, `NavbarClient.tsx`
- `PascalCase` for component directories: `components/ui/`, `app/hisse/`
- Semantic names preferred: `lib/signals.ts`, `lib/claude.ts`, `lib/supabase.ts`, `lib/rate-limit.ts`

**Functions:**
- `camelCase` for all functions: `calculateRSI()`, `detectRsiDivergence()`, `fetchOHLCV()`, `checkRateLimit()`
- Descriptive verb-first naming: `detect*`, `calculate*`, `fetch*`, `generate*`, `save*`, `create*`
- Examples: `generateSignalExplanation()`, `getAuthenticatedUser()`, `isInWatchlist()`, `addToWatchlist()`

**Variables:**
- `camelCase` for all variables: `sembol`, `candleData`, `userPrompt`, `apiKey`, `entryPrice`
- Constants in `UPPER_SNAKE_CASE`: `RATE_LIMIT`, `WINDOW_MS`, `INTERNAL_TOKEN`, `SYSTEM_PROMPT`
- Boolean prefixes when appropriate: `isUp`, `isDown`, `hasError`, `allowed`, `cancelled`
- Turkish identifiers common: `sembol` (stock symbol), `rüzgar` (wind), `şiddeti` (severity), `yön` (direction)

**Types:**
- `PascalCase` for all types and interfaces: `StockSignal`, `OHLCVCandle`, `SignalSeverity`, `SignalDirection`, `WatchlistItem`
- Suffix `Data` for signal-specific data objects: `RsiDivergenceData`, `VolumeAnomalyData`, `TrendStartData`, `BreakoutData`
- Suffix `Record` for database records: `SignalPerformanceRecord`
- Suffix `Stats` for statistical data: `SignalEdgeStats`, `HorizonEdgeStats`
- Union types explicit: `type Direction = 'yukari' | 'asagi'`

## Code Style

**Formatting:**
- Tabs: 2 spaces
- Line length: no hard limit enforced, but generally concise
- Quote style: single quotes for strings (TypeScript default), template literals for interpolation
- Semicolons: always present
- Trailing commas: used in multiline arrays/objects

**Linting:**
- ESLint enabled via `next lint` (Next.js default config: `eslint-config-next`)
- No custom `.eslintrc.*` file — uses Next.js defaults
- TypeScript strict mode enabled in `tsconfig.json`: `"strict": true`
- No Prettier explicitly configured; Next.js provides sensible defaults

**File Organization:**
- Comments placed above code they describe, not inline
- JSDoc-style comments for exported functions/types (when context is non-obvious)
- Inline comments minimal; code should be self-documenting
- Example from `lib/signals.ts`: function header comment describes purpose, input validation happens first

## Import Organization

**Order:**
1. External dependencies (React, Next.js, third-party packages)
2. Type imports: `import type { ... }`
3. Internal utilities/helpers from `@/lib`
4. Internal components from `@/components`
5. Type definitions from `@/types`

**Examples:**
```typescript
// API route pattern
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import type { OHLCVCandle } from '@/types';

// Component pattern
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { SignalBadge } from '@/components/SignalBadge';
import type { StockSignal } from '@/types';
import { createClient } from '@/lib/supabase';
```

**Path Aliases:**
- `@/*` maps to project root (configured in `tsconfig.json`)
- Used consistently: `@/lib/signals`, `@/components/StockCard`, `@/types`
- No relative imports (`../../../`) in codebase

## Error Handling

**Patterns:**
- Explicit type checking: `error instanceof Error ? error.message : 'Bilinmeyen hata'`
- Try-catch blocks wrap async operations
- Functions validate input before processing (see `lib/evaluate-signals/route.ts` lines 163-179)
- Database errors caught and wrapped with context: `throw new Error(\`İzleme listesi alınamadı: ${error.message}\`)`
- Network errors logged with context prefix: `console.error('[performance] Ağ hatası:', err)`
- Silent failure pattern used for non-critical operations: cache writes in `lib/claude.ts` catch errors but don't throw

**API Response Pattern:**
```typescript
// Success
return NextResponse.json({ explanation });

// Error with status
return NextResponse.json(
  { error: 'Geçersiz sinyal verisi.' },
  { status: 400 }
);

// Rate limit response
return NextResponse.json(
  { error: 'Çok fazla açıklama isteği.' },
  { status: 429, headers: { 'Retry-After': String(...) } }
);
```

**Fallback Values:**
- Null coalescing: `value ?? defaultValue`
- Optional chaining: `data?.user?.id`
- Array access safety: `array[index]!` with non-null assertion when safe, or conditional check
- Numeric validation: `Number.isFinite(value)` before calculations

## Logging

**Framework:** Built-in `console` object

**Patterns:**
- Prefix with scope in brackets: `console.error('[signals] Error:', message)`
- Common prefixes: `[performance]`, `[explain]`, `[ohlcv]`, `[evaluate-signals]`, `[claude]`
- Error context always included: `err instanceof Error ? err.message : err`
- Level distinction: `console.error()` for errors, no `console.warn()` or `console.info()` in codebase
- Production behavior: errors logged but not exposed directly (HTTP responses use generic messages)

## Comments

**When to Comment:**
- Algorithm explanation: RSI divergence detection (`lib/signals.ts` line 113)
- Non-obvious business logic: direction-aware return calculations
- Performance notes: "Production'da Redis'e geçilebilir" (`lib/rate-limit.ts` line 2)
- Version/migration notes: "v2 (Phase 6.2)", "v3 (Phase 8.3)" in `lib/claude.ts`
- NOT used for obvious code: no comments on simple loops or standard patterns

**JSDoc/TSDoc:**
- Exported public functions have inline JSDoc if behavior is non-obvious
- Example: `lib/rate-limit.ts` line 33-37 (checkRateLimit with @param descriptions)
- Not required for internal/private functions
- Type signatures preferred over comment documentation when possible

## Function Design

**Size:**
- Most functions 30-80 lines
- Longest: `lib/edge-engine.ts` computation functions (100+ lines for complex stats)
- Small utility functions: 1-10 lines (e.g., `calculateConfidenceScore()`)

**Parameters:**
- Prefer explicit parameters over config objects for <3 params
- Object/destructuring pattern for 3+ params: `SaveSignalPerformanceParams`, `CompositeContext`
- Type safety via TypeScript interfaces, not `any`
- Default values when sensible: `calculateRSI(closes: number[], period: number = 14)`

**Return Values:**
- Explicit types, no implicit `any`
- Nullable returns: `| null` when data might not exist
- Tuple returns for multiple values: `{ return_3d, return_7d, return_14d }` (object over tuple for readability)
- Async functions return `Promise<T>` or `Promise<void>`
- Union types for multiple possibilities: `'yukari' | 'asagi' | 'nötr'`

## Module Design

**Exports:**
- Named exports for utility functions: `export function detectRsiDivergence()`
- Named exports for types: `export interface StockSignal`
- Default export rare (only for React pages/components when required by Next.js)
- All public APIs have explicit `export` — no implicit exports

**Barrel Files:**
- `types/index.ts` aggregates all type definitions
- Not used for lib functions — each module is imported directly
- Example: `import type { StockSignal } from '@/types'`, not barrel

**Async/Await:**
- Consistent use of async/await over `.then()` chaining
- Try-catch for error handling, not `.catch()` chains
- Sequential async operations use await; parallel operations use `Promise.all()`

## Specific Patterns

**React Client Components:**
- `'use client'` directive at top of file
- Hooks: `useState()`, `useEffect()`, `useCallback()` standard
- Effect cleanup: return cleanup function when needed (see `components/StockCard.tsx` line 87-89)
- State initialization: inline, not in separate functions
- Props destructured with type interfaces

**Next.js API Routes:**
- `POST`, `GET` exported functions at module level
- `NextRequest` and `NextResponse` from 'next/server'
- Query params: `request.nextUrl.searchParams.get('param')`
- Request body: `await request.json()`
- Rate limiting applied early in function
- Input validation explicit and comprehensive

**Supabase Interaction:**
- Client creation: `createClient()` from `@/lib/supabase` (browser) or `createServerClient()` (server)
- Error checking: always check `error` property before using `data`
- Fallback values: `(data as Type[]) ?? []` for arrays
- Type casting with assertion: `as SignalPerformanceRecord[]`

**Styling:**
- Tailwind CSS classes exclusively
- Component classes via `cn()` utility from `lib/utils.ts`
- Color tokens: `text-primary`, `bg-surface`, `border-border`, `text-bullish`, `text-bearish`
- Responsive: `sm:`, `md:` prefixes for breakpoints
- CSS Modules: not used; all styling via Tailwind

---

*Convention analysis: 2026-03-19*
