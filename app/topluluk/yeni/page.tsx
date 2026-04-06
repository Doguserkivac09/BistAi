'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Send, AlertTriangle, CheckCircle2,
  BarChart3, Target, HelpCircle, Newspaper, MessageCircle,
  Eye, PenLine, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostCategory } from '@/types/community';
import { BIST_SYMBOLS } from '@/types';

type Tab = 'yaz' | 'önizle';

type CategoryConfig = {
  value: PostCategory;
  label: string;
  icon: React.ElementType;
  activeBg: string;
  activeBorder: string;
  activeText: string;
  icon_color: string;
  previewColor: string;
};

const CATEGORY_CONFIG: CategoryConfig[] = [
  {
    value: 'analiz',
    label: 'Analiz',
    icon: BarChart3,
    activeBg: 'bg-blue-500/15',
    activeBorder: 'border-blue-500',
    activeText: 'text-blue-400',
    icon_color: 'text-blue-400',
    previewColor: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  },
  {
    value: 'strateji',
    label: 'Strateji',
    icon: Target,
    activeBg: 'bg-green-500/15',
    activeBorder: 'border-green-500',
    activeText: 'text-green-400',
    icon_color: 'text-green-400',
    previewColor: 'border-green-500/30 bg-green-500/10 text-green-400',
  },
  {
    value: 'soru',
    label: 'Soru',
    icon: HelpCircle,
    activeBg: 'bg-yellow-500/15',
    activeBorder: 'border-yellow-500',
    activeText: 'text-yellow-400',
    icon_color: 'text-yellow-400',
    previewColor: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  },
  {
    value: 'haber',
    label: 'Haber',
    icon: Newspaper,
    activeBg: 'bg-purple-500/15',
    activeBorder: 'border-purple-500',
    activeText: 'text-purple-400',
    icon_color: 'text-purple-400',
    previewColor: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  },
  {
    value: 'genel',
    label: 'Genel',
    icon: MessageCircle,
    activeBg: 'bg-gray-500/15',
    activeBorder: 'border-gray-500',
    activeText: 'text-gray-400',
    icon_color: 'text-gray-400',
    previewColor: 'border-white/15 bg-white/5 text-white/50',
  },
];

const DRAFT_KEY = 'investableedge-post-draft';

function titleCounterColor(len: number): string {
  if (len >= 180) return 'text-red-400';
  if (len >= 150) return 'text-yellow-400';
  return 'text-white/40';
}

function bodyBarColor(pct: number): string {
  if (pct >= 94) return 'bg-red-500';
  if (pct >= 80) return 'bg-yellow-500';
  return 'bg-green-500';
}

export default function YeniPaylaşımPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('yaz');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PostCategory>('genel');
  const [sembol, setSembol] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Mount'ta taslak yükle
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const { title: t, body: b, category: c, sembol: s } = JSON.parse(raw) as {
          title?: string; body?: string; category?: PostCategory; sembol?: string;
        };
        if (t) setTitle(t);
        if (b) setBody(b);
        if (c) setCategory(c);
        if (s) setSembol(s);
        setHasDraft(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Değişince debounced kaydet (1s)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, category, sembol }));
    }, 1000);
    return () => clearTimeout(t);
  }, [title, body, category, sembol]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setTitle('');
    setBody('');
    setCategory('genel');
    setSembol('');
    setHasDraft(false);
  };

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 10;
  const sembolValid = sembol === '' || (BIST_SYMBOLS as readonly string[]).includes(sembol);
  const bodyPct = Math.min(100, (body.length / 5000) * 100);
  const activeCatConfig = CATEGORY_CONFIG.find((c) => c.value === category);

  const handleSubmit = async () => {
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          sembol: sembol.trim().toUpperCase() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Post oluşturulamadı');
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/topluluk/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Post oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a18]">
      <main className="container mx-auto max-w-2xl px-4 py-8">
        {/* Back */}
        <Link
          href="/topluluk"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Topluluk
        </Link>

        {/* Page title */}
        <h1 className="text-xl font-bold text-text-primary mb-6">Yeni Paylaşım</h1>

        {/* Draft banner */}
        {hasDraft && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 mb-4 animate-fade-in-up-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm text-emerald-400 flex-1">Taslak yüklendi</span>
            <button
              type="button"
              onClick={clearDraft}
              className="flex items-center gap-1 text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Temizle
            </button>
          </div>
        )}

        <Card className="border-border">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-text-primary">
                Paylaşım Detayları
              </CardTitle>
              {/* Yaz / Önizle sekmeleri */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTab('yaz')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                    tab === 'yaz'
                      ? 'bg-primary/15 text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Yaz
                </button>
                <button
                  type="button"
                  onClick={() => setTab('önizle')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border',
                    tab === 'önizle'
                      ? 'bg-primary/15 text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Önizle
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            {tab === 'yaz' ? (
              <div className="space-y-6 animate-fade-in">
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-3">Kategori</label>
                  <div className="grid grid-cols-5 gap-2">
                    {CATEGORY_CONFIG.map((cfg) => {
                      const Icon = cfg.icon;
                      const isActive = category === cfg.value;
                      return (
                        <button
                          key={cfg.value}
                          type="button"
                          onClick={() => setCategory(cfg.value)}
                          className={cn(
                            'hover-scale',
                            'rounded-xl border-2 p-4 flex flex-col items-center gap-2 cursor-pointer transition-all duration-150',
                            isActive
                              ? `${cfg.activeBg} ${cfg.activeBorder} ${cfg.activeText}`
                              : 'border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20'
                          )}
                        >
                          <Icon className={cn('h-6 w-6', isActive ? cfg.icon_color : 'text-white/30')} />
                          <span className="text-xs font-semibold leading-none">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="title" className="text-sm font-medium text-text-primary">
                      Başlık
                    </label>
                    <span className={cn('text-xs font-mono tabular-nums transition-colors', titleCounterColor(title.length))}>
                      {title.length}/200
                    </span>
                  </div>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    disabled={submitting}
                    placeholder="Başlık girin..."
                    className="w-full rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
                  />
                  {title.length > 0 && title.trim().length < 3 && (
                    <p className="mt-1 text-xs text-bearish">En az 3 karakter gerekli</p>
                  )}
                </div>

                {/* Body */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="body" className="text-sm font-medium text-text-primary">
                      İçerik
                    </label>
                    <span className="text-xs font-mono tabular-nums text-white/40">
                      {body.length}/5000
                    </span>
                  </div>
                  <textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={5000}
                    rows={8}
                    disabled={submitting}
                    placeholder="Analizinizi, sorunuzu veya görüşünüzü paylaşın..."
                    className="w-full rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-colors disabled:opacity-50"
                  />
                  {/* Progress bar */}
                  <div className="mt-2 h-1 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full progress-bar', bodyBarColor(bodyPct))}
                      style={{ width: `${bodyPct}%` }}
                    />
                  </div>
                  {body.length > 0 && body.trim().length < 10 && (
                    <p className="mt-1 text-xs text-bearish">En az 10 karakter gerekli</p>
                  )}
                </div>

                {/* Sembol */}
                <div>
                  <label htmlFor="sembol" className="block text-sm font-medium text-text-primary mb-2">
                    Hisse Sembolü{' '}
                    <span className="text-xs font-normal text-text-secondary/50">(opsiyonel)</span>
                  </label>
                  <input
                    id="sembol"
                    type="text"
                    value={sembol}
                    onChange={(e) => setSembol(e.target.value.toUpperCase())}
                    maxLength={10}
                    disabled={submitting}
                    placeholder="Örn: THYAO"
                    className="w-full max-w-[200px] rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
                  />
                  {sembol && !sembolValid && (
                    <p className="mt-1 text-xs text-yellow-400">&#x26A0; Tanımlanamayan sembol</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                {/* Önizleme */}
                <div className="rounded-xl border border-dashed border-border p-5 space-y-3 bg-white/[0.01]">
                  <p className="text-xs text-text-secondary text-center mb-4 pb-3 border-b border-border/50">
                    Paylaşımınız şu şekilde görünecek
                  </p>

                  {/* Başlık */}
                  <h2 className="text-base font-bold text-text-primary">
                    {title || <span className="text-text-secondary/40 italic">Başlık...</span>}
                  </h2>

                  {/* Kategori + sembol badges */}
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        activeCatConfig?.previewColor ?? 'border-white/15 bg-white/5 text-white/50'
                      )}
                    >
                      {activeCatConfig?.label}
                    </span>
                    {sembol && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {sembol}
                      </span>
                    )}
                  </div>

                  {/* İçerik */}
                  <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                    {body || <span className="italic opacity-40">İçerik...</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="px-8"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitting ? 'Gönderiliyor...' : 'Paylaşımı Gönder'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
