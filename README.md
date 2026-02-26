# BistAI

BIST hisselerinde AI destekli sinyal analizi — Türkçe arayüz, teknik sinyaller ve Claude ile açıklamalar.

## Kurulum

```bash
npm install
```

`.env.local` dosyasını düzenleyin (değerleri doldurun):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase proje URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `ANTHROPIC_API_KEY` — Claude API anahtarı (sinyal açıklamaları için)
- `NEXT_PUBLIC_APP_URL` — Uygulama URL (örn. http://localhost:3000)

## Veritabanı

Supabase projenizde `supabase/schema.sql` içeriğini çalıştırın (watchlist ve saved_signals tabloları + RLS).

## Çalıştırma

```bash
npm run dev
```

Tarayıcıda http://localhost:3000 adresini açın.

## Teknolojiler

- Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- lightweight-charts (TradingView)
- Yahoo Finance (query1.finance.yahoo.com v8 chart API)
- Anthropic Claude (claude-3-5-haiku)
- Supabase (Auth + PostgreSQL)
