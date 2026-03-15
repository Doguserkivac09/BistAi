/**
 * Environment variable validation with Zod.
 * Build sırasında veya server başlangıcında eksik/hatalı değişkenleri yakalar.
 *
 * Teknik Borç #3: Basit null check → Zod schema validation
 */

import { z } from 'zod';

// ── Schema ──────────────────────────────────────────────────────────

const envSchema = z.object({
  // Zorunlu — Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Geçerli bir Supabase URL olmalı'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'Anon key çok kısa'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'Service role key çok kısa'),

  // Opsiyonel — API anahtarları
  ANTHROPIC_API_KEY: z.string().optional(),
  INTERNAL_EVAL_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  FRED_API_KEY: z.string().optional(),
  TCMB_API_KEY: z.string().optional(),

  // Opsiyonel — Config (varsayılanlar ile)
  FRED_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  FRED_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
});

export type EnvConfig = z.infer<typeof envSchema>;

// ── Singleton cache ─────────────────────────────────────────────────

let _cachedEnv: EnvConfig | null = null;

// ── Validate ────────────────────────────────────────────────────────

export function validateEnv(): EnvConfig {
  if (_cachedEnv) return _cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    throw new Error(
      `Environment validation hatası:\n${errors}\n\n.env.local dosyasını kontrol edin.`
    );
  }

  // Opsiyonel eksikleri uyar (sadece dev'de)
  if (process.env.NODE_ENV !== 'production') {
    const optionalKeys = ['ANTHROPIC_API_KEY', 'FRED_API_KEY', 'TCMB_API_KEY'] as const;
    const missing = optionalKeys.filter((k) => !result.data[k]);
    if (missing.length > 0) {
      console.warn(`[env] Opsiyonel değişkenler eksik: ${missing.join(', ')}`);
    }
  }

  _cachedEnv = result.data;
  return result.data;
}

/**
 * Env değerini güvenli şekilde al. Validate edilmemişse önce validate eder.
 */
export function getEnv(): EnvConfig {
  return validateEnv();
}

// .env.example dosyası için template
export const ENV_TEMPLATE = `# BistAI Environment Variables
# Zorunlu
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Opsiyonel — API anahtarları
ANTHROPIC_API_KEY=sk-ant-...
INTERNAL_EVAL_TOKEN=random-secret-for-evaluation
CRON_SECRET=random-secret-for-cron
FRED_API_KEY=your-fred-api-key
TCMB_API_KEY=your-tcmb-api-key

# Opsiyonel — Config
# FRED_TIMEOUT_MS=10000
# FRED_MAX_RETRIES=2
`;
