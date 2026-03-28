'use client';

/**
 * Hisse sayfasında, watchlist'te ve portföyde kullanılır.
 * Fiyat alarmı oluşturmak için küçük bir modal açar.
 */

import { useState } from 'react';
import { Bell } from 'lucide-react';

interface Props {
  sembol: string;
  currentPrice?: number;
}

export function PriceAlertButton({ sembol, currentPrice }: Props) {
  const [open, setOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState(currentPrice?.toFixed(2) ?? '');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) {
      setMessage({ type: 'error', text: 'Geçerli bir fiyat girin.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/price-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sembol, target_price: price, direction, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Hata oluştu.');
      setMessage({ type: 'success', text: 'Alarm oluşturuldu! Fiyata ulaşınca email gönderilecek.' });
      setTimeout(() => setOpen(false), 1800);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Hata oluştu.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setMessage(null); }}
        title={`${sembol} için fiyat alarmı kur`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Bell className="h-3.5 w-3.5" />
        <span>Alarm Kur</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Fiyat Alarmı — {sembol}</h3>
                {currentPrice && (
                  <p className="text-xs text-text-secondary mt-0.5">Güncel fiyat: ₺{currentPrice.toFixed(2)}</p>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary text-lg leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Hedef fiyat */}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Hedef Fiyat (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetPrice}
                  onChange={e => setTargetPrice(e.target.value)}
                  placeholder="örn: 125.50"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none"
                  required
                />
              </div>

              {/* Yön */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">Tetiklenme Koşulu</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['above', 'below'] as const).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirection(d)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        direction === d
                          ? d === 'above'
                            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
                            : 'border-red-500/60 bg-red-500/10 text-red-400'
                          : 'border-border text-text-secondary hover:border-border/80'
                      }`}
                    >
                      {d === 'above' ? '↑ Üzerine çıkınca' : '↓ Altına düşünce'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Not (opsiyonel) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Not (opsiyonel)</label>
                <input
                  type="text"
                  maxLength={100}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="örn: Direnç kırılımı"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none"
                />
              </div>

              {message && (
                <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {loading ? 'Kaydediliyor…' : 'Alarm Kur'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
