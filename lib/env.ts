/**
 * Environment variable validation.
 * Build sırasında veya server başlangıcında eksik değişkenleri yakalar.
 */

interface EnvConfig {
  // Zorunlu
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Opsiyonel
  ANTHROPIC_API_KEY?: string;
  INTERNAL_EVAL_TOKEN?: string;
  CRON_SECRET?: string;
  FRED_API_KEY?: string;
}

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const optional = [
  'ANTHROPIC_API_KEY',
  'INTERNAL_EVAL_TOKEN',
  'CRON_SECRET',
  'FRED_API_KEY',
] as const;

export function validateEnv(): EnvConfig {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Eksik environment değişkenleri: ${missing.join(', ')}. ` +
      '.env.local dosyasını kontrol edin.'
    );
  }

  const warnings: string[] = [];
  for (const key of optional) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`[env] Opsiyonel değişkenler eksik: ${warnings.join(', ')}`);
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    INTERNAL_EVAL_TOKEN: process.env.INTERNAL_EVAL_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    FRED_API_KEY: process.env.FRED_API_KEY,
  };
}

// .env.example dosyası için template
export const ENV_TEMPLATE = `# BistAI Environment Variables
# Zorunlu
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Opsiyonel
ANTHROPIC_API_KEY=sk-ant-...
INTERNAL_EVAL_TOKEN=random-secret-for-evaluation
CRON_SECRET=random-secret-for-cron
FRED_API_KEY=your-fred-api-key
`;
