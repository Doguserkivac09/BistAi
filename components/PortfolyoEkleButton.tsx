'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Briefcase, Check } from 'lucide-react';

interface Props {
  sembol: string;
  defaultFiyat?: number; // son kapanış fiyatı — ön doldurma için
}

export function PortfolyoEkleButton({ sembol, defaultFiyat }: Props) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const [miktar, setMiktar]         = useState('');
  const [fiyat, setFiyat]           = useState(defaultFiyat ? String(defaultFiyat) : '');
  const [tarih, setTarih]           = useState(new Date().toISOString().slice(0, 10));

  async function handleSave() {
    if (!miktar || !fiyat || !tarih) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sembol,
          miktar:      Number(miktar),
          alis_fiyati: Number(fiyat),
          alis_tarihi: tarih,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Kaydedilemedi.');
      }
      setSaved(true);
      setTimeout(() => { setOpen(false); setSaved(false); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-primary hover:text-primary transition-colors"
        title="Portföye ekle"
      >
        <Briefcase className="h-3.5 w-3.5" />
        Portföye Ekle
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
            >
              {/* Başlık */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm text-text-primary">
                    Portföye Ekle —{' '}
                    <span className="text-primary">{sembol}</span>
                  </span>
                </div>
                <button onClick={() => setOpen(false)} className="rounded p-0.5 text-text-muted hover:text-text-primary">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                {/* 3 alan yan yana */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Lot</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={miktar}
                      onChange={(e) => setMiktar(e.target.value)}
                      placeholder="100"
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Fiyat (₺)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={fiyat}
                      onChange={(e) => setFiyat(e.target.value)}
                      placeholder="45.20"
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Tarih</label>
                    <input
                      type="date"
                      value={tarih}
                      onChange={(e) => setTarih(e.target.value)}
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-zinc-900 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                {/* Maliyet önizleme */}
                {miktar && fiyat && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 px-2.5 py-1 text-xs text-text-secondary">
                    Toplam:{' '}
                    <span className="font-semibold text-text-primary">
                      ₺{(Number(miktar) * Number(fiyat)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Hata */}
                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}
              </div>

              {/* Buton */}
              <button
                onClick={handleSave}
                disabled={saving || saved || !miktar || !fiyat || !tarih}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saved ? (
                  <><Check className="h-4 w-4" /> Eklendi</>
                ) : saving ? (
                  'Kaydediliyor…'
                ) : (
                  <><Plus className="h-4 w-4" /> Portföye Ekle</>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
