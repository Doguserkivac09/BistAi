'use client';

import { useEffect, useState } from 'react';
import { Bell, Trash2, CheckCircle, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import { PriceAlertButton } from '@/components/PriceAlertButton';

type PriceAlert = {
  id: string;
  sembol: string;
  target_price: number;
  direction: 'above' | 'below';
  note: string | null;
  triggered: boolean;
  triggered_at: string | null;
  created_at: string;
};

export default function FiyatAlertlerPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'triggered'>('active');

  async function loadAlerts() {
    setLoading(true);
    const res = await fetch('/api/price-alerts');
    if (res.ok) {
      const { alerts: data } = await res.json();
      setAlerts(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { loadAlerts(); }, []);

  async function deleteAlert(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/price-alerts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== id));
      } else {
        console.error('[fiyat-alertler] Silme başarısız:', await res.text());
      }
    } catch (err) {
      console.error('[fiyat-alertler] Ağ hatası:', err);
    } finally {
      setDeleting(null);
    }
  }

  const activeAlerts    = alerts.filter(a => !a.triggered);
  const triggeredAlerts = alerts.filter(a => a.triggered);
  const displayed       = tab === 'active' ? activeAlerts : triggeredAlerts;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Fiyat Alarmları
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Hedef fiyata ulaşınca email alırsınız
            </p>
          </div>
          <Link
            href="/watchlist"
            className="text-sm text-primary hover:underline"
          >
            Watchlist'e git →
          </Link>
        </div>

        {/* Tab'lar */}
        <div className="mb-5 flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(['active', 'triggered'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t === 'active'
                ? `Aktif (${activeAlerts.length})`
                : `Tetiklenenler (${triggeredAlerts.length})`}
            </button>
          ))}
        </div>

        {/* Liste */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface border border-border" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            {tab === 'active' ? (
              <>
                <Bell className="mx-auto mb-3 h-10 w-10 text-text-secondary/30" />
                <p className="text-text-secondary font-medium">Aktif alarm yok</p>
                <p className="text-text-secondary/60 text-sm mt-1 mb-4">
                  Hisse sayfası veya Watchlist'ten alarm kurabilirsiniz
                </p>
                <Link
                  href="/watchlist"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/30 px-4 py-2 text-sm text-primary hover:bg-primary/15"
                >
                  <Plus className="h-4 w-4" />
                  Watchlist'te alarm kur
                </Link>
              </>
            ) : (
              <>
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-text-secondary/30" />
                <p className="text-text-secondary">Henüz tetiklenen alarm yok</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map(alert => (
              <div
                key={alert.id}
                className={`rounded-xl border p-4 transition-all ${
                  alert.triggered
                    ? 'border-border/50 bg-surface/50 opacity-70'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* İkon */}
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      alert.triggered
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : alert.direction === 'above'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {alert.triggered ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/hisse/${alert.sembol}`}
                          className="text-base font-bold text-text-primary hover:text-primary"
                        >
                          {alert.sembol}
                        </Link>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                          alert.direction === 'above'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }`}>
                          {alert.direction === 'above' ? '↑ Üzerine çıkınca' : '↓ Altına düşünce'}
                        </span>
                      </div>

                      <p className="text-xl font-semibold text-text-primary mt-0.5">
                        ₺{alert.target_price.toFixed(2)}
                      </p>

                      {alert.note && (
                        <p className="text-xs text-text-secondary/70 italic mt-0.5">"{alert.note}"</p>
                      )}

                      <p className="text-[11px] text-text-secondary/50 mt-1">
                        {alert.triggered && alert.triggered_at
                          ? `Tetiklendi: ${new Date(alert.triggered_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
                          : `Kuruldu: ${new Date(alert.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`}
                      </p>
                    </div>
                  </div>

                  {/* Sil butonu */}
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    disabled={deleting === alert.id}
                    className="shrink-0 rounded-lg p-2 text-text-secondary/50 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                    title="Alarmı sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hızlı alarm kur */}
        {tab === 'active' && !loading && (
          <div className="mt-6 rounded-xl border border-dashed border-border/50 bg-surface/30 p-4">
            <p className="mb-3 text-sm font-medium text-text-secondary">Sembol girerek hızlı alarm kur:</p>
            <QuickAlertRow />
          </div>
        )}
      </main>
    </div>
  );
}

/** Sayfanın altında hızlıca sembol girip alarm kurma satırı */
function QuickAlertRow() {
  const [sembol, setSembol] = useState('');
  const [show, setShow] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={sembol}
        onChange={e => setSembol(e.target.value.toUpperCase())}
        placeholder="THYAO, GARAN..."
        maxLength={10}
        className="w-40 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none"
      />
      {sembol.length >= 2 && (
        show
          ? <PriceAlertButton sembol={sembol} />
          : (
            <button
              onClick={() => setShow(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary hover:border-primary/50 hover:text-primary"
            >
              <Bell className="h-3.5 w-3.5" />
              Alarm Kur
            </button>
          )
      )}
    </div>
  );
}
