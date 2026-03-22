'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostCategory } from '@/types/community';
import { CATEGORY_LABELS } from '@/types/community';

const CATEGORIES = Object.entries(CATEGORY_LABELS) as [PostCategory, { label: string; color: string }][];

export default function YeniPaylaşımPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PostCategory>('genel');
  const [sembol, setSembol] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 10;

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
      router.push(`/topluluk/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Post oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* Back */}
        <Link
          href="/topluluk"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Topluluk
        </Link>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-text-primary">Yeni Paylaşım</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            {/* Category */}
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Kategori</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(([value, { label, color }]) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Kategori: ${label}`}
                    aria-pressed={category === value}
                    onClick={() => setCategory(value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      category === value
                        ? `${color} ring-1 ring-current`
                        : 'border-border text-text-secondary hover:border-primary/30'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-xs text-text-secondary mb-1.5">
                Başlık
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={submitting}
                placeholder="Başlık girin..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <p className="text-[11px] text-text-secondary/60 mt-1">
                {title.length}/200
                {title.length > 0 && title.trim().length < 3 && (
                  <span className="ml-2 text-bearish">En az 3 karakter gerekli</span>
                )}
              </p>
            </div>

            {/* Body */}
            <div>
              <label htmlFor="body" className="block text-xs text-text-secondary mb-1.5">
                İçerik
              </label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                rows={8}
                disabled={submitting}
                placeholder="Analizinizi, sorunuzu veya görüşünüzü paylaşın..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
              />
              <p className="text-[11px] text-text-secondary/60 mt-1">
                {body.length}/5000
                {body.length > 0 && body.trim().length < 10 && (
                  <span className="ml-2 text-bearish">En az 10 karakter gerekli</span>
                )}
              </p>
            </div>

            {/* Sembol (optional) */}
            <div>
              <label htmlFor="sembol" className="block text-xs text-text-secondary mb-1.5">
                Hisse Sembolü <span className="text-text-secondary/40">(opsiyonel)</span>
              </label>
              <input
                id="sembol"
                type="text"
                value={sembol}
                onChange={(e) => setSembol(e.target.value.toUpperCase())}
                maxLength={10}
                disabled={submitting}
                placeholder="Ör: THYAO"
                className="w-full max-w-[200px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
              >
                <Send className="h-4 w-4 mr-1.5" />
                {submitting ? 'Gönderiliyor...' : 'Paylaş'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
